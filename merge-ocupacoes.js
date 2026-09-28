(function () {
    const TABELA_MESCLAGENS = "MERGE_MEDIDORES";

    function dataMerge(valor) {
        if (!valor) return null;
        const texto = String(valor).slice(0, 10);
        const partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (partes) return new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
        const data = new Date(valor);
        return Number.isNaN(data.getTime()) ? null : data;
    }

    function mergeAtivoNaData(m, data) {
        if (String(m.status || m.Status || "") !== "Ativa") return false;
        const inicio = dataMerge(m.dataInicio || m.DataInicio);
        const fim = dataMerge(m.dataFim || m.DataFim);
        const referencia = dataMerge(data);
        if (!inicio || !referencia || referencia < inicio) return false;
        return !(fim && referencia >= fim);
    }

    async function listarMesclagensOcupacoes(unidadeId) {
        const { data, error } = await db.from(TABELA_MESCLAGENS).select("*").eq("UnidadeID", unidadeId);
        if (error) throw error;
        return data || [];
    }

    function idPrincipal(m) {
        return String(m.LojaPrincipalID ?? m.lojaPrincipalId ?? "");
    }

    function idsDoRegistro(m) {
        return [
            m.LojaPrincipalID ?? m.lojaPrincipalId,
            m.LojaMescladaID ?? m.lojaMescladaId
        ].filter(v => v !== undefined && v !== null).map(String);
    }

    function chaveGrupo(m) {
        return [
            String(m.UnidadeID ?? m.unidadeId ?? ""),
            idPrincipal(m),
            String(m.DataInicio ?? m.dataInicio ?? ""),
            String(m.MedidorUnificado ?? m.medidorUnificado ?? "")
        ].join("|");
    }

    function agruparMesclagens(mesclagens, data) {
        const grupos = new Map();
        mesclagens.filter(m => mergeAtivoNaData(m, data)).forEach(m => {
            const chave = chaveGrupo(m);
            if (!grupos.has(chave)) {
                grupos.set(chave, {
                    chave,
                    principalId: idPrincipal(m),
                    medidor: m.MedidorUnificado ?? m.medidorUnificado ?? "-",
                    ids: []
                });
            }
            const grupo = grupos.get(chave);
            idsDoRegistro(m).forEach(id => {
                if (!grupo.ids.includes(id)) grupo.ids.push(id);
            });
        });
        return Array.from(grupos.values());
    }

    function codigoLoja(id, lista) {
        return lista.find(l => String(l.id) === String(id))?.codigoLoja || `Loja ${id}`;
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
        const [listaLojas, mesclagens, ocupacoes] = await Promise.all([
            getJSON("listarLojas", { unidadeId }),
            listarMesclagensOcupacoes(unidadeId),
            getJSON("listarOcupacoes")
        ]);

        lojas = listaLojas;
        ocupacoesBrutas = ocupacoes;
        window._lojasOcupacao = listaLojas;
        window._mesclagensOcupacao = mesclagens;
        window._dataOcupacao = dataInicio;

        const grupos = agruparMesclagens(mesclagens, dataInicio);
        const lojasMescladas = new Set(grupos.flatMap(g => g.ids));
        let html = "";

        // Uma mesclagem representa uma única medição, mas pode conter vários espaços físicos.
        // Por isso a opção mostra todas as lojas e gera apenas uma leitura inicial.
        grupos.forEach(grupo => {
            const ocupada = grupo.ids.some(id => ocupacoes.some(o =>
                String(o.lojaId) === String(id) && String(o.status || "Ativa") === "Ativa"
            ));
            if (ocupada) return;

            const codigos = grupo.ids.map(id => codigoLoja(id, listaLojas));
            html += `
                <label class="linha-check">
                    <input type="checkbox" id="chk_merge_${grupo.principalId}" value="${grupo.principalId}"
                        data-codigo="${codigos.join(" + ")}" data-medidor="${grupo.medidor}"
                        data-merge-ids="${grupo.ids.join(",")}" data-mesclada="true"
                        onchange="renderizarCamposLeiturasEntrada()">
                    <span>${codigos.join(" + ")} (Medidor: ${grupo.medidor} — unificado)</span>
                </label>`;
        });

        listaLojas.forEach(loja => {
            if (lojasMescladas.has(String(loja.id))) return;
            if (String(loja.status || "Ativa") === "Inativa") return;
            const ocupada = ocupacoes.some(o =>
                String(o.lojaId) === String(loja.id) && String(o.status || "Ativa") === "Ativa"
            );
            if (ocupada) return;

            html += `
                <label class="linha-check">
                    <input type="checkbox" id="chk_loja_${loja.id}" value="${loja.id}"
                        data-codigo="${loja.codigoLoja}" data-medidor="${loja.medidor || "-"}"
                        onchange="renderizarCamposLeiturasEntrada()">
                    <span>${loja.codigoLoja} (Medidor: ${loja.medidor || "-"})</span>
                </label>`;
        });

        container.innerHTML = html || "<span class='texto-alerta'>Nenhuma loja disponivel para esta data.</span>";
        renderizarCamposLeiturasEntradaMescladas();
    }

    function renderizarCamposLeiturasEntradaMescladas() {
        const container = $("containerLeiturasIniciais");
        const checkboxes = document.querySelectorAll("#containerCheckboxesLojas input[type='checkbox']:checked");
        if (!container) return;

        container.innerHTML = Array.from(checkboxes).map(chk => {
            const codigo = chk.getAttribute("data-codigo") || "";
            const medidor = chk.getAttribute("data-medidor") || "-";
            const idsMerge = chk.getAttribute("data-merge-ids");
            const idCampo = idsMerge ? `leitura_inicial_merge_${chk.value}` : `leitura_inicial_loja_${chk.value}`;
            const sufixo = idsMerge ? " — unificado" : "";
            return `<div class="bloco-leitura">
                <label>Leitura Inicial - ${codigo} (Medidor: ${medidor}${sufixo})</label>
                <input type="number" id="${idCampo}" step="0.01" placeholder="Digite a leitura atual" min="0" required>
            </div>`;
        }).join("");
    }

    async function salvarOcupacaoMesclada() {
        const id = $("ocupacaoId")?.value || "";
        if (id && typeof window._salvarOcupacaoOriginal === "function") {
            return window._salvarOcupacaoOriginal();
        }

        const clienteId = $("ocupacaoCliente")?.value || "";
        const unidadeId = $("ocupacaoUnidade")?.value || "";
        const dataInicio = $("ocupacaoDataInicio")?.value || "";
        const selecionadas = Array.from(document.querySelectorAll("#containerCheckboxesLojas input[type='checkbox']:checked"));

        if (!clienteId || !unidadeId || !dataInicio || !selecionadas.length) {
            alert("Preencha todos os campos obrigatorios e marque ao menos uma loja.");
            return;
        }

        for (const chk of selecionadas) {
            const idsMerge = (chk.getAttribute("data-merge-ids") || "").split(",").filter(Boolean);
            const campo = idsMerge.length ? $(`leitura_inicial_merge_${chk.value}`) : $(`leitura_inicial_loja_${chk.value}`);
            if (!campo || campo.value === "") {
                alert(`Preencha a Leitura Inicial de ${chk.getAttribute("data-codigo") || "todas as lojas"}.`);
                return;
            }
        }

        for (const chk of selecionadas) {
            const idsMerge = (chk.getAttribute("data-merge-ids") || "").split(",").filter(Boolean);
            const idsParaSalvar = idsMerge.length ? idsMerge : [chk.value];
            const campo = idsMerge.length ? $(`leitura_inicial_merge_${chk.value}`) : $(`leitura_inicial_loja_${chk.value}`);
            const leituraInicial = campo.value;

            for (const lojaId of idsParaSalvar) {
                await postJSON({
                    action: "cadastrarOcupacao",
                    clienteId,
                    unidadeId,
                    lojaId,
                    dataInicio,
                    leituraInicial
                });
            }
        }

        fecharModalOcupacao();
        setTimeout(listarOcupacoes, 1000);
    }

    const originalAtualizarSelectLojas = window.atualizarSelectLojas;
    const originalSalvarOcupacao = window.salvarOcupacao;
    window._atualizarSelectLojasOriginal = originalAtualizarSelectLojas;
    window._salvarOcupacaoOriginal = originalSalvarOcupacao;
    window.atualizarSelectLojas = atualizarSelectLojasMescladas;
    window.renderizarCamposLeiturasEntrada = renderizarCamposLeiturasEntradaMescladas;
    window.salvarOcupacao = salvarOcupacaoMesclada;

    document.addEventListener("DOMContentLoaded", () => {
        const campoData = $("ocupacaoDataInicio");
        if (campoData) campoData.addEventListener("change", atualizarSelectLojasMescladas);
    });
})();