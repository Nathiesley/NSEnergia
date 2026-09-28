(function () {
    const TABELA_MESCLAGENS_AJUSTE = "MERGE_MEDIDORES";

    function dataAjuste(valor) {
        if (!valor) return null;
        const texto = String(valor).slice(0, 10);
        const partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (partes) return new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
        const data = new Date(valor);
        return Number.isNaN(data.getTime()) ? null : data;
    }

    function isoAjuste(valor) {
        const data = dataAjuste(valor);
        if (!data) return "";
        return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
    }

    function adicionarDiaAjuste(valor) {
        const data = dataAjuste(valor);
        if (!data) return "";
        data.setDate(data.getDate() + 1);
        return isoAjuste(data);
    }

    function mesmoAjuste(a, b) {
        return String(a ?? "").trim() === String(b ?? "").trim();
    }

    const gerarRateioComHistorico = window.gerarRateioDados;
    if (typeof gerarRateioComHistorico !== "function") return;

    window.gerarRateioDados = async function (unidadeId, competencia) {
        const registros = await gerarRateioComHistorico(unidadeId, competencia);
        if (!Array.isArray(registros) || !registros.length) return registros;

        const [ocupacoes, lojasResposta, mesclagensResposta] = await Promise.all([
            listarOcupacoesDados(),
            listarLojasDados(unidadeId),
            db.from(TABELA_MESCLAGENS_AJUSTE).select("*").eq("UnidadeID", unidadeId)
        ]);
        if (mesclagensResposta.error) throw mesclagensResposta.error;
        const mesclagens = mesclagensResposta.data || [];

        function mergeAtivo(merge, data) {
            if (String(merge.Status ?? merge.status ?? "") !== "Ativa") return false;
            const inicio = dataAjuste(merge.DataInicio ?? merge.dataInicio);
            const fim = dataAjuste(merge.DataFim ?? merge.dataFim);
            const referencia = dataAjuste(data);
            if (!inicio || !referencia || referencia < inicio) return false;
            return !(fim && referencia >= fim);
        }

        function mergeDaLoja(lojaId, data) {
            return mesclagens.find(m => {
                if (!mergeAtivo(m, data)) return false;
                const principal = m.LojaPrincipalID ?? m.lojaPrincipalId;
                const mesclada = m.LojaMescladaID ?? m.lojaMescladaId;
                return mesmoAjuste(principal, lojaId) || mesmoAjuste(mesclada, lojaId);
            }) || null;
        }

        function grupoDoMerge(merge, data) {
            if (!merge) return null;
            const principal = String(merge.LojaPrincipalID ?? merge.lojaPrincipalId ?? "");
            const inicio = String(merge.DataInicio ?? merge.dataInicio ?? "");
            const medidor = String(merge.MedidorUnificado ?? merge.medidorUnificado ?? "");
            const grupo = mesclagens.filter(m =>
                mergeAtivo(m, data) &&
                String(m.LojaPrincipalID ?? m.lojaPrincipalId ?? "") === principal &&
                String(m.DataInicio ?? m.dataInicio ?? "") === inicio &&
                String(m.MedidorUnificado ?? m.medidorUnificado ?? "") === medidor
            );
            const ids = [principal, ...grupo.map(m => String(m.LojaMescladaID ?? m.lojaMescladaId ?? ""))]
                .filter(Boolean)
                .filter((id, indice, lista) => lista.indexOf(id) === indice);
            return { principal, ids, inicio };
        }

        function codigoLoja(lojaId) {
            return lojasResposta.find(loja => mesmoAjuste(loja.id, lojaId))?.codigoLoja || `Loja ${lojaId}`;
        }

        const atualizacoes = [];
        for (const registro of registros) {
            const ocupacao = ocupacoes.find(o => mesmoAjuste(o.id, registro.OcupacaoID));
            if (!ocupacao) continue;

            const fimOcupacao = dataAjuste(ocupacao.dataFim);
            if (String(ocupacao.status || "") === "Encerrada" && fimOcupacao) {
                // Ocupacoes encerradas antes da fusao permanecem individualizadas.
                atualizacoes.push({
                    id: registro.ID ?? registro.id,
                    dados: { LojaCodigo: codigoLoja(ocupacao.lojaId) }
                });
                continue;
            }

            const merge = mergeDaLoja(ocupacao.lojaId, registro.PeriodoFim);
            const grupo = grupoDoMerge(merge, registro.PeriodoFim);
            if (grupo) {
                const inicioMinimo = adicionarDiaAjuste(grupo.inicio);
                const periodoAtual = dataAjuste(registro.PeriodoInicio);
                const periodoMinimo = dataAjuste(inicioMinimo);
                const novoInicio = periodoMinimo && (!periodoAtual || periodoAtual < periodoMinimo) ? inicioMinimo : registro.PeriodoInicio;
                atualizacoes.push({
                    id: registro.ID ?? registro.id,
                    dados: {
                        LojaCodigo: grupo.ids.map(codigoLoja).join(" + "),
                        PeriodoInicio: novoInicio
                    }
                });
            }
        }

        for (const atualizacao of atualizacoes) {
            if (atualizacao.id === undefined || atualizacao.id === null) continue;
            const { error } = await db.from(TABELAS.rateios).update(atualizacao.dados).eq("ID", atualizacao.id);
            if (error) throw error;
            Object.assign(registros.find(r => mesmoAjuste(r.ID ?? r.id, atualizacao.id)) || {}, atualizacao.dados);
        }

        return registros;
    };
})();
