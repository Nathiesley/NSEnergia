(function () {
    const TABELA_MESCLAGENS = "MERGE_MEDIDORES";

    function dataValor(valor) {
        return dataLocal(valor);
    }

    function inicioDia(valor) {
        const data = dataValor(valor);
        if (!data) return null;
        data.setHours(0, 0, 0, 0);
        return data;
    }

    function adicionarDia(valor, quantidade) {
        return somarDiasISO(valor, quantidade);
    }

    function dataDentroIntervalo(data, inicio, fim) {
        const d = inicioDia(data);
        const i = inicioDia(inicio);
        const f = inicioDia(fim);
        return !!(d && i && f && d >= i && d <= f);
    }

    function sobreposicaoOcupacao(ocupacao, inicio, fim) {
        const ocupacaoInicio = inicioDia(ocupacao.dataInicio);
        const ocupacaoFim = inicioDia(ocupacao.dataFim || fim);
        const periodoInicio = inicioDia(inicio);
        const periodoFim = inicioDia(fim);
        if (!ocupacaoInicio || !periodoInicio || !periodoFim) return null;
        const inicioEfetivo = ocupacaoInicio > periodoInicio ? ocupacaoInicio : periodoInicio;
        const fimEfetivo = ocupacaoFim < periodoFim ? ocupacaoFim : periodoFim;
        if (inicioEfetivo > fimEfetivo) return null;
        return {
            inicio: dataISO(inicioEfetivo),
            fim: dataISO(fimEfetivo)
        };
    }

    async function listarMesclagensRateio(unidadeId) {
        const { data, error } = await db
            .from(TABELA_MESCLAGENS)
            .select("*")
            .eq("UnidadeID", unidadeId);
        if (error) throw error;
        return normalizarLista(data || []);
    }

    function mesclagemAtivaNaDataRateio(merge, data) {
        const status = String(merge.status || merge.Status || "");
        if (status !== "Ativa") return false;
        const inicio = dataValor(merge.dataInicio || merge.DataInicio);
        const fim = dataValor(merge.dataFim || merge.DataFim);
        const referencia = dataValor(data);
        if (!inicio || !referencia || referencia < inicio) return false;
        if (fim && referencia >= fim) return false;
        return true;
    }

    function grupoMesclagemDaLojaRateio(lojaId, data, mesclagens) {
        const merge = (mesclagens || []).find(item => {
            if (!mesclagemAtivaNaDataRateio(item, data)) return false;
            const principal = item.lojaPrincipalId || item.LojaPrincipalID;
            const mesclada = item.lojaMescladaId || item.LojaMescladaID;
            return String(principal) === String(lojaId) || String(mesclada) === String(lojaId);
        });
        if (!merge) return null;
        const chave = [
            String(merge.unidadeId || merge.UnidadeID || ""),
            String(merge.lojaPrincipalId || merge.LojaPrincipalID || ""),
            String(merge.dataInicio || merge.DataInicio || ""),
            String(merge.medidorUnificado || merge.MedidorUnificado || "")
        ].join("|");
        return {
            chave,
            principal: String(merge.lojaPrincipalId || merge.LojaPrincipalID),
            ids: [...new Set((mesclagens || [])
                .filter(item => {
                    const chaveItem = [
                        String(item.unidadeId || item.UnidadeID || ""),
                        String(item.lojaPrincipalId || item.LojaPrincipalID || ""),
                        String(item.dataInicio || item.DataInicio || ""),
                        String(item.medidorUnificado || item.MedidorUnificado || "")
                    ].join("|");
                    return chaveItem === chave && mesclagemAtivaNaDataRateio(item, data);
                })
                .flatMap(item => [
                    item.lojaPrincipalId || item.LojaPrincipalID,
                    item.lojaMescladaId || item.LojaMescladaID
                ]))],
            inicio: merge.dataInicio || merge.DataInicio,
            medidor: merge.medidorUnificado || merge.MedidorUnificado
        };
    }

    function codigoLojasGrupoRateio(grupo, lojasPorId) {
        if (!grupo) return "";
        return grupo.ids
            .map(id => lojasPorId.get(String(id))?.codigoLoja || `Loja ${id}`)
            .filter(Boolean)
            .filter((valor, indice, lista) => lista.indexOf(valor) === indice)
            .join(" + ");
    }

    function ocupacoesDaLojaNoPeriodoRateio(ocupacoes, lojaId, inicio, fim) {
        return ocupacoes
            .filter(ocupacao => mesmoId(ocupacao.lojaId, lojaId))
            .map(ocupacao => ({ ocupacao, intervalo: sobreposicaoOcupacao(ocupacao, inicio, fim) }))
            .filter(item => item.intervalo)
            .sort((a, b) => (dataValor(a.intervalo.inicio)?.getTime() || 0) - (dataValor(b.intervalo.inicio)?.getTime() || 0));
    }

    function numeroValido(valor) {
        return valor !== null && valor !== undefined && valor !== "" && Number.isFinite(Number(valor));
    }

    function consumoPorIntervaloRateio(leitura, ocupacao, intervalo, inicioPeriodo, fimPeriodo) {
        const inicioEhPeriodo = dataISO(intervalo.inicio) === dataISO(inicioPeriodo);
        const fimEhPeriodo = dataISO(intervalo.fim) === dataISO(fimPeriodo);

        let leituraInicial;
        if (inicioEhPeriodo) {
            leituraInicial = Number(leitura.leituraAnterior || 0);
        } else if (numeroValido(ocupacao.leituraInicial)) {
            leituraInicial = Number(ocupacao.leituraInicial);
        } else {
            leituraInicial = Number(leitura.leituraAnterior || 0);
        }

        let leituraFinal;
        if (!fimEhPeriodo && numeroValido(ocupacao.leituraFinal)) {
            leituraFinal = Number(ocupacao.leituraFinal);
        } else if (fimEhPeriodo) {
            leituraFinal = Number(leitura.leituraAtual || 0);
        } else if (numeroValido(ocupacao.leituraFinal)) {
            leituraFinal = Number(ocupacao.leituraFinal);
        } else {
            leituraFinal = Number(leitura.leituraAtual || 0);
        }

        return leituraFinal - leituraInicial;
    }

    function criarRegistroRateioRateio({ unidadeId, competencia, leitura, loja, ocupacao, lojaCodigo, periodoInicio, periodoFim, consumo, valorKwh }) {
        return {
            UnidadeID: unidadeId,
            Competencia: competencia,
            OcupacaoID: ocupacao?.id || ocupacao?.ocupacaoId || null,
            LojaID: leitura.lojaId,
            LojaCodigo: lojaCodigo || loja?.codigoLoja || leitura.lojaCodigo || "",
            ClienteNome: ocupacao?.clienteNome || "Vaga / area comum",
            PeriodoInicio: periodoInicio || "",
            PeriodoFim: periodoFim || "",
            Consumo: Number(consumo || 0),
            ValorKwh: valorKwh,
            ValorRateado: Number(consumo || 0) * valorKwh,
            Situacao: "Concluido"
        };
    }

    async function gerarRateioDadosCorrigido(unidadeId, competencia) {
        const [faturasDados, leiturasDados, ocupacoesDados, lojasDaUnidade, mesclagens] = await Promise.all([
            listarFaturasDados(unidadeId),
            listarLeiturasDados(unidadeId),
            listarOcupacoesDados(),
            listarLojasDados(unidadeId),
            listarMesclagensRateio(unidadeId)
        ]);

        const fatura = faturasDados.find(item => String(item.unidadeId).trim() === String(unidadeId).trim() && normalizarCompetencia(item.competencia) === competencia);
        if (!fatura) throw new Error("Nao existe fatura para esta competencia e unidade.");

        const leiturasCompetencia = leiturasDados.filter(item => normalizarCompetencia(item.competencia) === competencia);
        if (!leiturasCompetencia.length) throw new Error("Nao existem leituras para esta competencia.");

        const valorKwh = Number(fatura.valorKwh || (Number(fatura.valorConta || 0) / Number(fatura.consumoTotal || 1)));
        const lojasPorId = new Map(lojasDaUnidade.map(loja => [String(loja.id), loja]));
        const registros = [];
        const lojasComLeituraAtual = new Set();

        // 1) Divide cada leitura da competência pelos contratos que realmente ocuparam o período.
        for (const leitura of leiturasCompetencia) {
            lojasComLeituraAtual.add(String(leitura.lojaId));
            const inicioPeriodo = dataISO(leitura.dataLeituraAnterior);
            const fimPeriodo = dataISO(leitura.dataLeituraAtual);
            if (!inicioPeriodo || !fimPeriodo) continue;

            const ocupacoes = ocupacoesDaLojaNoPeriodoRateio(ocupacoesDados, leitura.lojaId, adicionarDia(inicioPeriodo, 1), fimPeriodo);
            const grupoNoFim = grupoMesclagemDaLojaRateio(leitura.lojaId, fimPeriodo, mesclagens);
            const lojaCodigoAtual = grupoNoFim ? codigoLojasGrupoRateio(grupoNoFim, lojasPorId) : (lojasPorId.get(String(leitura.lojaId))?.codigoLoja || leitura.lojaCodigo || "");

            if (!ocupacoes.length) {
                registros.push(criarRegistroRateioRateio({
                    unidadeId,
                    competencia,
                    leitura,
                    loja: lojasPorId.get(String(leitura.lojaId)),
                    ocupacao: null,
                    lojaCodigo: lojaCodigoAtual,
                    periodoInicio: adicionarDia(inicioPeriodo, 1),
                    periodoFim: fimPeriodo,
                    consumo: Number(leitura.consumo || (Number(leitura.leituraAtual) - Number(leitura.leituraAnterior)) || 0),
                    valorKwh
                }));
                continue;
            }

            for (const item of ocupacoes) {
                const ocupacao = item.ocupacao;
                const intervalo = item.intervalo;
                const merge = grupoMesclagemDaLojaRateio(leitura.lojaId, intervalo.fim, mesclagens);
                const lojaCodigo = merge ? codigoLojasGrupoRateio(merge, lojasPorId) : (lojasPorId.get(String(leitura.lojaId))?.codigoLoja || leitura.lojaCodigo || "");
                const consumo = consumoPorIntervaloRateio(leitura, ocupacao, intervalo, inicioPeriodo, fimPeriodo);

                registros.push(criarRegistroRateioRateio({
                    unidadeId,
                    competencia,
                    leitura,
                    loja: lojasPorId.get(String(leitura.lojaId)),
                    ocupacao,
                    lojaCodigo,
                    periodoInicio: intervalo.inicio,
                    periodoFim: intervalo.fim,
                    consumo,
                    valorKwh
                }));
            }

            // Se o último contrato terminou antes da leitura atual, a diferença passa a ser vaga/área comum.
            const ultimaOcupacao = ocupacoes[ocupacoes.length - 1]?.ocupacao;
            const fimUltima = ultimaOcupacao?.dataFim ? dataISO(ultimaOcupacao.dataFim) : fimPeriodo;
            if (fimUltima && dataValor(fimUltima) < dataValor(fimPeriodo)) {
                const leituraFinal = numeroValido(ultimaOcupacao?.leituraFinal) ? Number(ultimaOcupacao.leituraFinal) : Number(leitura.leituraAnterior || 0);
                const consumoVago = Number(leitura.leituraAtual || 0) - leituraFinal;
                if (consumoVago !== 0 || dataValor(adicionarDia(fimUltima, 1)) <= dataValor(fimPeriodo)) {
                    registros.push(criarRegistroRateioRateio({
                        unidadeId,
                        competencia,
                        leitura,
                        loja: lojasPorId.get(String(leitura.lojaId)),
                        ocupacao: null,
                        lojaCodigo: grupoMesclagemDaLojaRateio(leitura.lojaId, adicionarDia(fimUltima, 1), mesclagens) ? codigoLojasGrupoRateio(grupoMesclagemDaLojaRateio(leitura.lojaId, adicionarDia(fimUltima, 1), mesclagens), lojasPorId) : (lojasPorId.get(String(leitura.lojaId))?.codigoLoja || leitura.lojaCodigo || ""),
                        periodoInicio: adicionarDia(fimUltima, 1),
                        periodoFim: fimPeriodo,
                        consumo: consumoVago,
                        valorKwh
                    }));
                }
            }
        }

        // 2) Lojas que deixaram de ter leitura porque o medidor foi desativado ainda precisam
        //    aparecer no rateio com o consumo do contrato encerrado dentro da competência.
        const dataMinimaCompetencia = (() => {
            const leituras = leiturasCompetencia.map(item => dataValor(item.dataLeituraAnterior)).filter(Boolean);
            if (!leituras.length) return null;
            return new Date(Math.min(...leituras.map(data => data.getTime())));
        })();
        const dataMaximaCompetencia = (() => {
            const leituras = leiturasCompetencia.map(item => dataValor(item.dataLeituraAtual)).filter(Boolean);
            if (!leituras.length) return null;
            return new Date(Math.max(...leituras.map(data => data.getTime())));
        })();

        if (dataMinimaCompetencia && dataMaximaCompetencia) {
            for (const ocupacao of ocupacoesDados) {
                if (!ocupacao.dataFim || !numeroValido(ocupacao.leituraFinal)) continue;
                if (!mesmoId(ocupacao.unidadeId, unidadeId)) continue;
                if (lojasComLeituraAtual.has(String(ocupacao.lojaId))) continue;

                const fimOcupacao = dataValor(ocupacao.dataFim);
                if (!fimOcupacao || fimOcupacao < dataMinimaCompetencia || fimOcupacao > dataMaximaCompetencia) continue;

                const leituraAnterior = [...leiturasDados]
                    .filter(item => mesmoId(item.lojaId, ocupacao.lojaId))
                    .filter(item => {
                        const data = dataValor(item.dataLeituraAtual);
                        return data && data <= fimOcupacao;
                    })
                    .sort((a, b) => (dataValor(b.dataLeituraAtual)?.getTime() || 0) - (dataValor(a.dataLeituraAtual)?.getTime() || 0))[0];

                if (!leituraAnterior) continue;

                const inicioConsumo = dataISO(leituraAnterior.dataLeituraAtual);
                const consumo = Number(ocupacao.leituraFinal) - Number(leituraAnterior.leituraAtual || 0);
                if (!Number.isFinite(consumo)) continue;

                const grupo = grupoMesclagemDaLojaRateio(ocupacao.lojaId, fimOcupacao, mesclagens);
                const lojaCodigo = grupo ? codigoLojasGrupoRateio(grupo, lojasPorId) : (lojasPorId.get(String(ocupacao.lojaId))?.codigoLoja || ocupacao.lojaCodigo || "");

                registros.push(criarRegistroRateioRateio({
                    unidadeId,
                    competencia,
                    leitura: { lojaId: ocupacao.lojaId, lojaCodigo: ocupacao.lojaCodigo },
                    loja: lojasPorId.get(String(ocupacao.lojaId)),
                    ocupacao,
                    lojaCodigo,
                    periodoInicio: adicionarDia(inicioConsumo, 1),
                    periodoFim: dataISO(fimOcupacao),
                    consumo,
                    valorKwh
                }));
            }
        }

        // Evita registros de consumo negativo causados por ajustes excepcionais de medidor.
        registros.forEach(registro => {
            if (!Number.isFinite(Number(registro.Consumo))) registro.Consumo = 0;
            if (!Number.isFinite(Number(registro.ValorRateado))) registro.ValorRateado = 0;
        });

        const { error } = await db.from(TABELAS.rateios).insert(registros);
        if (error) throw error;
        return registros;
    }

    // Substitui somente a geração do rateio. Nenhuma rotina de faturas, leituras ou ocupações é alterada.
    window.gerarRateioDados = gerarRateioDadosCorrigido;
})();
