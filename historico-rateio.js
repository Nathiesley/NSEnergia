(function () {
    const TABELA_MESCLAGENS_HIST = "MERGE_MEDIDORES";
    let contextoCache = null;
    let listenerDataInstalado = false;

    function dataHist(valor) {
        if (!valor) return null;
        const texto = String(valor).slice(0, 10);
        const partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (partes) return new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
        const data = new Date(valor);
        return Number.isNaN(data.getTime()) ? null : data;
    }

    function isoHist(valor) {
        const data = dataHist(valor);
        if (!data) return "";
        return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
    }

    function adicionarDiaHist(valor) {
        const data = dataHist(valor);
        if (!data) return "";
        data.setDate(data.getDate() + 1);
        return isoHist(data);
    }

    function mesmoHist(a, b) {
        return String(a ?? "").trim() === String(b ?? "").trim();
    }

    function ordenarDescData(lista, campo) {
        return [...(lista || [])].sort((a, b) => (dataHist(b[campo])?.getTime() || 0) - (dataHist(a[campo])?.getTime() || 0));
    }

    async function carregarContexto(unidadeId) {
        if (contextoCache && mesmoHist(contextoCache.unidadeId, unidadeId)) return contextoCache;
        const [leituras, ocupacoes, lojas, mesclagens] = await Promise.all([
            listarLeiturasDados(unidadeId),
            listarOcupacoesDados(),
            listarLojasDados(unidadeId),
            db.from(TABELA_MESCLAGENS_HIST).select("*").eq("UnidadeID", unidadeId).order("DataInicio", { ascending: true })
        ]);
        if (mesclagens.error) throw mesclagens.error;
        contextoCache = {
            unidadeId,
            leituras,
            ocupacoes: ocupacoes.filter(o => mesmoHist(o.unidadeId, unidadeId)),
            lojas,
            mesclagens: mesclagens.data || []
        };
        return contextoCache;
    }

    function mergeAtivoNaDataHist(merge, data) {
        if (String(merge.Status ?? merge.status ?? "") !== "Ativa") return false;
        const inicio = dataHist(merge.DataInicio ?? merge.dataInicio);
        const fim = dataHist(merge.DataFim ?? merge.dataFim);
        const referencia = dataHist(data);
        if (!inicio || !referencia || referencia < inicio) return false;
        return !(fim && referencia >= fim);
    }

    function grupoMergeDaLoja(merge, lojaId) {
        const principal = String(merge.LojaPrincipalID ?? merge.lojaPrincipalId ?? "");
        const mesclada = String(merge.LojaMescladaID ?? merge.lojaMescladaId ?? "");
        return principal === String(lojaId) || mesclada === String(lojaId);
    }

    function encontrarMerge(contexto, lojaId, data) {
        return contexto.mesclagens.find(m => mergeAtivoNaDataHist(m, data) && grupoMergeDaLoja(m, lojaId)) || null;
    }

    function grupoMerge(contexto, merge, data) {
        if (!merge) return null;
        const principal = String(merge.LojaPrincipalID ?? merge.lojaPrincipalId ?? "");
        const inicio = String(merge.DataInicio ?? merge.dataInicio ?? "");
        const medidor = String(merge.MedidorUnificado ?? merge.medidorUnificado ?? "");
        const registros = contexto.mesclagens.filter(m => {
            if (!mergeAtivoNaDataHist(m, data)) return false;
            return String(m.LojaPrincipalID ?? m.lojaPrincipalId ?? "") === principal
                && String(m.DataInicio ?? m.dataInicio ?? "") === inicio
                && String(m.MedidorUnificado ?? m.medidorUnificado ?? "") === medidor;
        });
        const ids = [principal, ...registros.map(m => String(m.LojaMescladaID ?? m.lojaMescladaId ?? ""))]
            .filter(Boolean)
            .filter((id, indice, lista) => lista.indexOf(id) === indice);
        return { principal, ids, medidor };
    }

    function codigoLojaHist(contexto, id) {
        return contexto.lojas.find(loja => mesmoHist(loja.id, id))?.codigoLoja || `Loja ${id}`;
    }

    function leituraMaisRecenteAntes(contexto, lojaId, dataLimite) {
        const limite = dataHist(dataLimite);
        return ordenarDescData(
            contexto.leituras.filter(leitura => {
                if (!mesmoHist(leitura.lojaId, lojaId)) return false;
                const data = dataHist(leitura.dataLeituraAtual);
                return data && limite && data < limite;
            }),
            "dataLeituraAtual"
        )[0] || null;
    }

    function leituraMaisRecenteAte(contexto, lojaId, dataLimite) {
        const limite = dataHist(dataLimite);
        return ordenarDescData(
            contexto.leituras.filter(leitura => {
                if (!mesmoHist(leitura.lojaId, lojaId)) return false;
                const data = dataHist(leitura.dataLeituraAtual);
                return data && limite && data <= limite;
            }),
            "dataLeituraAtual"
        )[0] || null;
    }

    function ocupacoesEncerradasEntre(contexto, lojaIds, dataLeituraAtual) {
        const limite = dataHist(dataLeituraAtual);
        if (!limite) return [];
        return contexto.ocupacoes.filter(ocupacao => {
            if (!lojaIds.some(id => mesmoHist(id, ocupacao.lojaId))) return false;
            if (String(ocupacao.status || "") !== "Encerrada") return false;
            const fim = dataHist(ocupacao.dataFim);
            if (!fim || fim > limite || ocupacao.leituraFinal === "" || ocupacao.leituraFinal === null || ocupacao.leituraFinal === undefined) return false;
            const ultimaLeitura = leituraMaisRecenteAntes(contexto, ocupacao.lojaId, dataLeituraAtual);
            const dataUltima = dataHist(ultimaLeitura?.dataLeituraAtual);
            return !dataUltima || fim > dataUltima;
        });
    }

    function baselineParaLoja(contexto, lojaId, dataLeituraAtual) {
        const leituraAnterior = leituraMaisRecenteAntes(contexto, lojaId, dataLeituraAtual);
        let dataAnterior = leituraAnterior?.dataLeituraAtual || "";
        let valorAnterior = leituraAnterior ? Number(leituraAnterior.leituraAtual || 0) : 0;

        const fechadas = contexto.ocupacoes
            .filter(o => mesmoHist(o.lojaId, lojaId) && String(o.status || "") === "Encerrada")
            .filter(o => {
                const fim = dataHist(o.dataFim);
                const limite = dataHist(dataLeituraAtual);
                return fim && limite && fim <= limite && (o.leituraFinal !== "" && o.leituraFinal !== null && o.leituraFinal !== undefined);
            })
            .sort((a, b) => (dataHist(b.dataFim)?.getTime() || 0) - (dataHist(a.dataFim)?.getTime() || 0));

        const encerramento = fechadas.find(o => {
            const fim = dataHist(o.dataFim);
            const anterior = dataHist(dataAnterior);
            return !anterior || (fim && fim > anterior);
        });

        if (encerramento) {
            dataAnterior = encerramento.dataFim;
            valorAnterior = Number(encerramento.leituraFinal || 0);
        }

        return { dataAnterior: dataAnterior || "-", valorAnterior };
    }

    async function ajustarItensParaDataLeitura(unidadeId, dataLeituraAtual) {
        if (!dataLeituraAtual || !Array.isArray(itensNovaLeitura) || !itensNovaLeitura.length) return;
        const contexto = await carregarContexto(unidadeId);

        itensNovaLeitura = itensNovaLeitura.map(item => {
            const principal = String(item.lojaId);
            const merge = encontrarMerge(contexto, principal, dataLeituraAtual);
            const lojaBase = merge ? String(merge.LojaPrincipalID ?? merge.lojaPrincipalId) : principal;
            const baseline = baselineParaLoja(contexto, lojaBase, dataLeituraAtual);
            return {
                ...item,
                dataLeituraAnterior: baseline.dataAnterior,
                leituraAnterior: baseline.valorAnterior
            };
        });
    }

    function preservarValoresAtuais() {
        const valores = {};
        (itensNovaLeitura || []).forEach(item => {
            const campo = $(`leitura_atual_${item.lojaId}`);
            if (campo && campo.value !== "") valores[String(item.lojaId)] = campo.value;
        });
        return valores;
    }

    function restaurarValoresAtuais(valores) {
        Object.entries(valores || {}).forEach(([lojaId, valor]) => {
            const campo = $(`leitura_atual_${lojaId}`);
            if (campo) campo.value = valor;
            const item = (itensNovaLeitura || []).find(i => String(i.lojaId) === lojaId);
            if (item) atualizarConsumoLeitura(item.lojaId, item.leituraAnterior);
        });
    }

    async function atualizarAnteriorVisualmente() {
        const data = $("leituraDataAtual")?.value || "";
        if (!data || !unidadeLeiturasSelecionada) return;
        const valores = preservarValoresAtuais();
        await ajustarItensParaDataLeitura(unidadeLeiturasSelecionada.id, data);
        renderizarTabelaNovaLeitura();
        restaurarValoresAtuais(valores);
    }

    async function instalarListenerData() {
        if (listenerDataInstalado) return;
        listenerDataInstalado = true;
        const campo = $("leituraDataAtual");
        if (campo) campo.addEventListener("change", atualizarAnteriorVisualmente);
    }

    const originalAbrirModalLeituraHistorico = window.abrirModalLeitura;
    if (typeof originalAbrirModalLeituraHistorico === "function") {
        window.abrirModalLeitura = async function () {
            await originalAbrirModalLeituraHistorico();
            await instalarListenerData();
            await atualizarAnteriorVisualmente();
        };
    }

    const originalSalvarLeituraHistorico = window.salvarLeitura;
    if (typeof originalSalvarLeituraHistorico === "function") {
        window.salvarLeitura = async function () {
            await atualizarAnteriorVisualmente();
            return originalSalvarLeituraHistorico();
        };
    }

    function criarRegistroRateio(base, dados) {
        return {
            UnidadeID: base.unidadeId,
            Competencia: base.competencia,
            OcupacaoID: dados.ocupacaoId || null,
            LojaID: dados.lojaId || null,
            LojaCodigo: dados.lojaCodigo || "",
            ClienteNome: dados.clienteNome || "Vaga / area comum",
            PeriodoInicio: dados.periodoInicio || "",
            PeriodoFim: dados.periodoFim || "",
            Consumo: Number(dados.consumo || 0),
            ValorKwh: base.valorKwh,
            ValorRateado: Number(dados.consumo || 0) * base.valorKwh,
            Situacao: "Concluido"
        };
    }

    function ocupacaoAtivaNaDataHist(contexto, lojaId, data) {
        const referencia = dataHist(data);
        return contexto.ocupacoes
            .filter(o => mesmoHist(o.lojaId, lojaId))
            .filter(o => {
                const inicio = dataHist(o.dataInicio);
                const fim = dataHist(o.dataFim);
                return inicio && referencia && inicio <= referencia && (!fim || referencia <= fim);
            })
            .sort((a, b) => (dataHist(b.dataInicio)?.getTime() || 0) - (dataHist(a.dataInicio)?.getTime() || 0))[0] || null;
    }

    function construirLinhaAtiva(contexto, leitura, base) {
        const inicioMedicao = dataHist(leitura.dataLeituraAnterior);
        const fimMedicao = dataHist(leitura.dataLeituraAtual);
        if (!fimMedicao) return null;

        const merge = encontrarMerge(contexto, leitura.lojaId, leitura.dataLeituraAtual);
        const grupo = grupoMerge(contexto, merge, leitura.dataLeituraAtual);
        const lojaPrincipal = grupo?.principal || String(leitura.lojaId);
        const ocupacao = ocupacaoAtivaNaDataHist(contexto, lojaPrincipal, leitura.dataLeituraAtual);
        const inicioOcupacao = dataHist(ocupacao?.dataInicio);
        const inicioPeriodo = inicioMedicao ? adicionarDiaHist(leitura.dataLeituraAnterior) : isoHist(ocupacao?.dataInicio || leitura.dataLeituraAnterior);
        const inicio = dataHist(inicioPeriodo);
        const inicioFinal = inicioOcupacao && inicioOcupacao > inicio ? isoHist(inicioOcupacao) : inicioPeriodo;
        const periodoFim = isoHist(fimMedicao);
        if (!inicioFinal || dataHist(inicioFinal) > fimMedicao) return null;

        const baseline = baselineParaLoja(contexto, lojaPrincipal, leitura.dataLeituraAtual);
        const consumo = Number(leitura.leituraAtual || 0) - Number(baseline.valorAnterior || 0);
        const lojaCodigo = grupo
            ? grupo.ids.map(id => codigoLojaHist(contexto, id)).join(" + ")
            : codigoLojaHist(contexto, leitura.lojaId);
        const medidor = grupo?.medidor || contexto.lojas.find(l => mesmoHist(l.id, leitura.lojaId))?.medidor;

        return criarRegistroRateio(base, {
            ocupacaoId: ocupacao?.id,
            lojaId: lojaPrincipal,
            lojaCodigo,
            clienteNome: ocupacao?.clienteNome,
            periodoInicio: inicioFinal,
            periodoFim,
            consumo
        });
    }

    function construirLinhasEncerradas(contexto, base, dataLeituraAtual, leiturasCompetencia) {
        const resultado = [];
        const lojasComLeituraAtual = new Set(leiturasCompetencia.map(l => String(l.lojaId)));
        const ocupacoes = ocupacoesEncerradasEntre(contexto, contexto.lojas.map(l => l.id), dataLeituraAtual);

        ocupacoes.forEach(ocupacao => {
            const fim = dataHist(ocupacao.dataFim);
            if (!fim) return;

            const ultimaAntesDoFim = leituraMaisRecenteAntes(contexto, ocupacao.lojaId, ocupacao.dataFim);
            const inicioBase = ultimaAntesDoFim?.dataLeituraAtual || ocupacao.dataInicio;
            const inicio = dataHist(inicioBase);
            if (!inicio || fim <= inicio) return;

            const consumo = Number(ocupacao.leituraFinal || 0) - Number(ultimaAntesDoFim?.leituraAtual ?? ocupacao.leituraInicial ?? 0);
            const loja = contexto.lojas.find(l => mesmoHist(l.id, ocupacao.lojaId));
            const mergeNoFim = encontrarMerge(contexto, ocupacao.lojaId, ocupacao.dataFim);
            const grupoNoFim = mergeNoFim ? grupoMerge(contexto, mergeNoFim, ocupacao.dataFim) : null;

            // Ocupacoes encerradas antes da mesclagem permanecem separadas.
            // Se a ocupacao ja estava dentro de uma mesclagem ativa no encerramento, a linha usa o grupo unificado.
            const lojaCodigo = grupoNoFim
                ? grupoNoFim.ids.map(id => codigoLojaHist(contexto, id)).join(" + ")
                : loja?.codigoLoja || `Loja ${ocupacao.lojaId}`;

            resultado.push(criarRegistroRateio(base, {
                ocupacaoId: ocupacao.id,
                lojaId: ocupacao.lojaId,
                lojaCodigo,
                clienteNome: contexto.ocupacoes.find(o => mesmoHist(o.id, ocupacao.id))?.clienteNome || ocupacao.clienteNome,
                periodoInicio: adicionarDiaHist(inicioBase),
                periodoFim: isoHist(fim),
                consumo
            }));
        });

        return resultado;
    }

    async function gerarRateioHistorico(unidadeId, competencia) {
        const [faturasDados, leiturasDados, contexto] = await Promise.all([
            listarFaturasDados(unidadeId),
            listarLeiturasDados(unidadeId),
            carregarContexto(unidadeId)
        ]);

        const fatura = faturasDados.find(item => mesmoHist(item.unidadeId, unidadeId) && normalizarCompetencia(item.competencia) === competencia);
        if (!fatura) throw new Error("Nao existe fatura para esta competencia e unidade.");

        const leiturasCompetencia = leiturasDados.filter(item => normalizarCompetencia(item.competencia) === competencia);
        if (!leiturasCompetencia.length) throw new Error("Nao existem leituras para esta competencia.");

        const valorKwh = Number(fatura.valorKwh || (Number(fatura.valorConta || 0) / Number(fatura.consumoTotal || 1)));
        const base = { unidadeId, competencia, valorKwh };
        const registros = [];

        // Primeiro, as leituras da competencia. Para o medidor unificado, a linha usa apenas a loja principal.
        leiturasCompetencia.forEach(leitura => {
            const linha = construirLinhaAtiva(contexto, leitura, base);
            if (linha) registros.push(linha);
        });

        // Depois, os encerramentos ocorridos entre a ultima leitura daquele medidor e a leitura atual.
        // Isso inclui a Loja 5, que nao possui leitura atual apos a desativacao do seu medidor.
        const dataAtualMaxima = leiturasCompetencia
            .map(l => dataHist(l.dataLeituraAtual))
            .filter(Boolean)
            .sort((a, b) => b.getTime() - a.getTime())[0];
        if (dataAtualMaxima) {
            const encerradas = construirLinhasEncerradas(contexto, base, isoHist(dataAtualMaxima), leiturasCompetencia);
            encerradas.forEach(linha => {
                const duplicado = registros.some(r =>
                    mesmoHist(r.ocupacaoId, linha.ocupacaoId) &&
                    mesmoHist(r.periodoInicio, linha.periodoInicio) &&
                    mesmoHist(r.periodoFim, linha.periodoFim)
                );
                if (!duplicado) registros.push(linha);
            });
        }

        if (!registros.length) throw new Error("Nao foi possivel identificar periodos de ocupacao para esta competencia.");

        const { error } = await db.from(TABELAS.rateios).insert(registros);
        if (error) throw error;
        return registros;
    }

    const gerarRateioOriginal = window.gerarRateioDados;
    if (typeof gerarRateioOriginal === "function") {
        window.gerarRateioDados = gerarRateioHistorico;
    }

    window.atualizarAnteriorLeituraHistorico = atualizarAnteriorVisualmente;
})();
