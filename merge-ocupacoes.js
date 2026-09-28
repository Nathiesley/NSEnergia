(function () {
    const TABELA_MESCLAGENS = "MERGE_MEDIDORES";

    function dataLocalMerge(valor) {
        if (!valor) return null;
        const texto = String(valor).slice(0, 10);
        const partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (partes) return new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
        const data = new Date(valor);
        return Number.isNaN(data.getTime()) ? null : data;
    }

    function mesclagemAtivaNaDataMerge(m, data) {
        if (String(m.status || m.Status || "") !== "Ativa") return false;
        const inicio = dataLocalMerge(m.dataInicio || m.DataInicio);
        const fim = dataLocalMerge(m.dataFim || m.DataFim);
        const referencia = dataLocalMerge(data);
        if (!inicio || !referencia || referencia < inicio) return false;
        if (fim && referencia >= fim) return false;
        return true;
    }

    async function listarMesclagensOcupacoes(unidadeId) {
        const { data, error } = await db
            .from(TABELA_MESCLAGENS)
            .select("*")
            .eq("UnidadeID", unidadeId);
        if (error) throw error;
        return data || [];
    }

    function estadoLojaNaData(loja, dataReferencia, mesclagens) {
        const merge = mesclagens.find(m => {
            if (!mesclagemAtivaNaDataMerge(m, dataReferencia)) return false;
            const principal = String(m.LojaPrincipalID ?? m.lojaPrincipalId ?? "");
            const mesclada = String(m.LojaMescladaID ?? m.lojaMescladaId ?? "");
            return principal === String(loja.id) || mesclada === String(loja.id);
        });

        if (!merge) {
            return {
                ativa: String(loja.status || "Ativa") !== "Inativa",
                medidor: loja.medidor || "-",
                mesclada: false,
                principal: false,
                merge: null
            };
        }

        const principal = String(merge.LojaPrincipalID ?? merge.lojaPrincipalId ?? "");
        const ehPrincipal = principal === String(loja.id);

        return {
            ativa: ehPrincipal,
            medidor: ehPrincipal ? (merge.MedidorUnificado ?? merge.medidorUnificado ?? loja.medidor ?? "-") : (loja.medidor || "-"),
            mesclada: true,
            principal: ehPrincipal,
            merge
        };
    }

    function atualizarCamposLeituraOcupacaoMerge() {
        if (typeof renderizarCamposLeiturasEntrada === "function") {
            renderizarCamposLeiturasEntrada();
        }
    }

    async function atualizarSelectLojasMescladas() {
        const unidadeId = $("ocupacaoUnidade")?.value || "";
        const container = $("containerCheckboxesLojas");
        if ($("containerLeiturasIniciais")) $("containerLeiturasIniciais").innerHTML = "";
        if (!unidadeId || !container) {
            if (container) container.innerHTML = "<span class='texto-ajuda'>Selecione uma unidade primeiro.</span>";
            return;
        }

        const dataInicio = $("ocupacaoDataInicio")?.value || hojeISO();
        const [listaLoj, mesclagens, ocupacoes] = await Promise.all([
            getJSON("listarLojas", { unidadeId }),
            listarMesclagensOcupacoes(unidadeId),
            getJSON("listarOcupacoes")
        ]);

        lojas = listaLoj;
        window._lojasOcupacao = listaLoj;
        window._mesclagensOcupacao = mesclagens;
        window._dataOcupacao = dataInicio;
        ocupacoesBrutas = ocupacoes;

        let html = "";
        listaLoj.forEach(loja => {
            const estado = estadoLojaNaData(loja, dataInicio, mesclagens);
            const ocupada = ocupacoes.some(o =>
                Number(o.lojaId) === Number(loja.id) &&
                o.status === "Ativa" &&
                !estado.mesclada
            );

            if (!estado.ativa || ocupada) return;

            const textoMedidor = estado.principal && estado.mesclada
                ? `${estado.medidor} (medidor unificado)`
                : (estado.medidor || "-");

            html += `
                <label class="linha-check">
                    <input type="checkbox" id="chk_loja_${loja.id}" value="${loja.id}" data-codigo="${loja.codigoLoja}" data-medidor="${estado.medidor}" onchange="renderizarCamposLeiturasEntrada()">
                    <span>${loja.codigoLoja} (Medidor: ${textoMedidor})</span>
                </label>`;
        });

        container.innerHTML = html || "<span class='texto-alerta'>Nenhuma loja disponivel para esta data.</span>";
        atualizarCamposLeituraOcupacaoMerge();
    }

    function renderizarCamposLeiturasEntradaMescladas() {
        const container = $("containerLeiturasIniciais");
        const checkboxes = document.querySelectorAll("#containerCheckboxesLojas input[type='checkbox']:checked");
        if (!container) return;

        const listaLoj = window._lojasOcupacao || lojas || [];
        const mesclagens = window._mesclagensOcupacao || [];
        const dataInicio = $("ocupacaoDataInicio")?.value || hojeISO();

        container.innerHTML = Array.from(checkboxes).map(chk => {
            const idLoja = chk.value;
            const codigoLoja = chk.getAttribute("data-codigo") || "";
            const lojaDados = listaLoj.find(l => Number(l.id) === Number(idLoja));
            const estado = lojaDados ? estadoLojaNaData(lojaDados, dataInicio, mesclagens) : null;
            const medidor = estado?.medidor || chk.getAttribute("data-medidor") || lojaDados?.medidor || "-";

            return `
                <div class="bloco-leitura">
                    <label>Leitura Inicial - ${codigoLoja} (Medidor: ${medidor})</label>
                    <input type="number" id="leitura_inicial_${idLoja}" step="0.01" placeholder="Digite a leitura atual">
                </div>`;
        }).join("");
    }

    const originalAtualizarSelectLojas = window.atualizarSelectLojas;
    window.atualizarSelectLojas = atualizarSelectLojasMescladas;
    window.renderizarCamposLeiturasEntrada = renderizarCamposLeiturasEntradaMescladas;

    document.addEventListener("DOMContentLoaded", () => {
        const campoData = $("ocupacaoDataInicio");
        if (campoData) campoData.addEventListener("change", atualizarSelectLojasMescladas);
    });

    if (typeof originalAtualizarSelectLojas === "function") {
        // Mantém a referência disponível apenas para compatibilidade; a versão mesclada passa a ser a oficial.
        window._atualizarSelectLojasOriginal = originalAtualizarSelectLojas;
    }
})();