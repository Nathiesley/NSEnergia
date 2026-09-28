(function () {
    const TABELA_MESCLAGENS = "MERGE_MEDIDORES";
    let modalInicializado = false;
    let mesclagensCache = [];

    function escapeHtml(valor) {
        return String(valor ?? "").replace(/[&<>\'\"]/g, c => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
        }[c]));
    }

    function chaveMesclagemGrupo(m) {
        return [
            String(m.unidadeId || m.UnidadeID || ""),
            String(m.lojaPrincipalId || m.LojaPrincipalID || ""),
            String(m.dataInicio || m.DataInicio || ""),
            String(m.medidorUnificado || m.MedidorUnificado || "")
        ].join("|");
    }

    async function listarMesclagens(unidadeId) {
        const { data, error } = await db
            .from(TABELA_MESCLAGENS)
            .select("*")
            .eq("UnidadeID", unidadeId)
            .order("DataInicio", { ascending: true });
        if (error) throw error;
        return (data || []).map(item => normalizarRegistro(item));
    }

    function mesclagemAtivaNaData(m, data) {
        if (String(m.status || m.Status) !== "Ativa") return false;
        const inicioValor = m.dataInicio || m.DataInicio;
        const fimValor = m.dataFim || m.DataFim;
        const ref = new Date(`${data}T00:00:00`);
        const inicio = new Date(`${inicioValor}T00:00:00`);
        if (ref < inicio) return false;
        // DataFim é exclusiva: ao desfazer hoje, a separação vale a partir de hoje.
        if (fimValor && ref >= new Date(`${fimValor}T00:00:00`)) return false;
        return true;
    }

    function obterMesclagemDaLoja(lojaId, data, mesclagens) {
        return mesclagens.find(m => {
            if (!mesclagemAtivaNaData(m, data)) return false;
            return String(m.lojaPrincipalId || m.LojaPrincipalID) === String(lojaId)
                || String(m.lojaMescladaId || m.LojaMescladaID) === String(lojaId);
        }) || null;
    }

    function lojaCodigo(lojaId, lista) {
        return lista.find(l => String(l.id) === String(lojaId))?.codigoLoja || `Loja ${lojaId}`;
    }

    function agruparMesclagens(lista) {
        const grupos = new Map();
        (lista || []).forEach(m => {
            const chave = chaveMesclagemGrupo(m);
            if (!grupos.has(chave)) grupos.set(chave, []);
            grupos.get(chave).push(m);
        });
        return Array.from(grupos.values());
    }

    function ontemISO() {
        return somarDiasISO(hojeISO(), -1);
    }

    function criarModalSeNecessario() {
        if (modalInicializado) return;
        modalInicializado = true;
        document.body.insertAdjacentHTML("beforeend", `
<div class="modal" id="modalMesclagem">
  <div class="modal-content modal-grande">
    <h2>Mesclar lojas</h2>
    <p>Selecione as lojas que passaram a compartilhar o mesmo medidor.</p>
    <label>Lojas</label>
    <div id="mesclaLojas" class="caixa-checks"></div>
    <label>Data em que a medição foi unificada</label>
    <input type="date" id="mesclaData">
    <label>Medidor que será mantido</label>
    <select id="mesclaMedidor"></select>
    <p id="mesclaAviso"></p>
    <div class="botoes-modal">
      <button class="btn-cancelar" onclick="document.getElementById('modalMesclagem').style.display='none'">Cancelar</button>
      <button class="btn-salvar" onclick="salvarMesclagem()">Mesclar lojas</button>
    </div>
  </div>
</div>`);

        document.addEventListener("change", event => {
            if (event.target.closest("#mesclaLojas")) atualizarMedidoresMesclagem();
        });
    }

    function atualizarMedidoresMesclagem() {
        const ids = Array.from(document.querySelectorAll("#mesclaLojas input[type='checkbox']:checked"))
            .map(input => String(input.value));
        const lojasDaUnidade = window._lojasMesclagem || [];
        const candidatos = lojasDaUnidade.filter(loja => ids.includes(String(loja.id)));
        const select = $("mesclaMedidor");
        if (!select) return;
        select.innerHTML = candidatos.map(loja =>
            `<option value="${escapeHtml(loja.medidor || "")}">${escapeHtml(loja.codigoLoja)} — Medidor ${escapeHtml(loja.medidor || "-")}</option>`
        ).join("");
        select.disabled = candidatos.length < 2;
        $("mesclaAviso").innerText = candidatos.length < 2
            ? "Marque pelo menos duas lojas."
            : "Escolha qual dos medidores será mantido. As leituras anteriores não serão alteradas.";
    }

    async function abrirModalMesclagem() {
        if (!unidadeSelecionada) return;
        const lojasDaUnidade = (await listarLojasDados(unidadeSelecionada.id))
            .filter(loja => String(loja.status || "Ativa") !== "Inativa");
        if (lojasDaUnidade.length < 2) {
            alert("É necessário ter pelo menos duas lojas ativas na unidade para mesclar.");
            return;
        }

        criarModalSeNecessario();
        $("mesclaLojas").innerHTML = lojasDaUnidade.map(loja => `
            <label class="linha-check">
                <input type="checkbox" value="${loja.id}">
                <span><strong>${escapeHtml(loja.codigoLoja)}</strong> — Medidor ${escapeHtml(loja.medidor || "-")}</span>
            </label>`).join("");
        $("mesclaMedidor").innerHTML = '<option value="">Selecione as lojas primeiro</option>';
        $("mesclaMedidor").disabled = true;
        $("mesclaData").value = hojeISO();
        $("mesclaAviso").innerText = "Marque as lojas que passaram a compartilhar o mesmo medidor.";
        window._lojasMesclagem = lojasDaUnidade;
        $("modalMesclagem").style.display = "flex";
    }

    async function salvarMesclagem() {
        if (!unidadeSelecionada) return;
        const dataInicio = $("mesclaData")?.value;
        const lojaIds = Array.from(document.querySelectorAll("#mesclaLojas input[type='checkbox']:checked"))
            .map(input => Number(input.value));
        const medidorUnificado = $("mesclaMedidor")?.value;

        if (!dataInicio || lojaIds.length < 2 || !medidorUnificado) {
            alert("Selecione pelo menos duas lojas, a data da unificação e o medidor que será mantido.");
            return;
        }

        const hoje = hojeISO();
        if (dataInicio > hoje) {
            alert("A data da unificação não pode ser futura.");
            return;
        }

        const existentes = await listarMesclagens(unidadeSelecionada.id);
        const conflito = existentes.some(m => {
            if (String(m.status || m.Status) !== "Ativa") return false;
            const inicioExistente = m.dataInicio || m.DataInicio;
            const idsExistentes = [m.lojaPrincipalId || m.LojaPrincipalID, m.lojaMescladaId || m.LojaMescladaID].map(String);
            return dataInicio >= inicioExistente && lojaIds.some(id => idsExistentes.includes(String(id)));
        });
        if (conflito) {
            alert("Uma ou mais lojas já participam de uma mesclagem ativa nesse período. Desfaça a mesclagem anterior antes de criar outra.");
            return;
        }

        const principal = lojaIds[0];
        const registros = lojaIds.filter(id => id !== principal).map(id => ({
            UnidadeID: unidadeSelecionada.id,
            LojaPrincipalID: principal,
            LojaMescladaID: id,
            DataInicio: dataInicio,
            DataFim: null,
            MedidorUnificado: Number(medidorUnificado),
            Status: "Ativa"
        }));

        const { error } = await db.from(TABELA_MESCLAGENS).insert(registros);
        if (error) throw error;

        $("modalMesclagem").style.display = "none";
        alert(`Mesclagem criada. A partir de ${formatarDataBR(dataInicio)}, ${lojaIds.length} lojas usarão o medidor ${medidorUnificado}.`);
        await selecionarUnidade(unidadeSelecionada.id);
    }

    async function desfazerMesclagem(id) {
        const merge = mesclagensCache.find(m => String(m.id) === String(id));
        if (!merge) return;

        const chave = chaveMesclagemGrupo(merge);
        const grupo = mesclagensCache.filter(m =>
            String(m.status || m.Status) === "Ativa" && chaveMesclagemGrupo(m) === chave
        );
        const inicio = merge.dataInicio || merge.DataInicio;
        const lojasGrupo = new Set();
        grupo.forEach(m => {
            lojasGrupo.add(String(m.lojaPrincipalId || m.LojaPrincipalID));
            lojasGrupo.add(String(m.lojaMescladaId || m.LojaMescladaID));
        });

        if (!confirm(`Desfazer a mesclagem de ${lojasGrupo.size} lojas iniciada em ${formatarDataBR(inicio)}? As leituras anteriores serão preservadas e, a partir de hoje, as lojas voltarão a ser tratadas separadamente.`)) return;

        const ids = grupo.map(m => m.id);
        const { error } = await db
            .from(TABELA_MESCLAGENS)
            .update({ Status: "Desfeita", DataFim: hojeISO() })
            .in("ID", ids);
        if (error) throw error;

        alert("Mesclagem desfeita. O histórico anterior foi preservado.");
        await selecionarUnidade(unidadeSelecionada.id);
    }

    function adicionarBotaoMesclar() {
        const detalhes = $("detalhesUnidade");
        if (!detalhes || !unidadeSelecionada) return;
        if (detalhes.querySelector("#btnMesclarLojas")) return;

        const btn = document.createElement("button");
        btn.id = "btnMesclarLojas";
        btn.className = "btn-nova-loja";
        btn.innerText = "Mesclar lojas";
        btn.onclick = abrirModalMesclagem;

        const btnInserir = detalhes.querySelector(".btn-nova-loja");
        if (btnInserir) btnInserir.parentNode.insertBefore(btn, btnInserir.nextSibling);
        else detalhes.appendChild(btn);
    }

    async function atualizarSecaoMesclagens() {
        if (!unidadeSelecionada) return;
        try {
            mesclagensCache = await listarMesclagens(unidadeSelecionada.id);
            const detalhes = $("detalhesUnidade");
            if (!detalhes) return;

            const secaoAnterior = detalhes.querySelector("#secaoMesclagens");
            if (secaoAnterior) secaoAnterior.remove();

            const grupos = agruparMesclagens(mesclagensCache);
            const div = document.createElement("div");
            div.id = "secaoMesclagens";

            let html = "";
            grupos.forEach(grupo => {
                const primeiro = grupo[0];
                const ativa = grupo.every(m => String(m.status || m.Status) === "Ativa");
                const principal = primeiro.lojaPrincipalId || primeiro.LojaPrincipalID;
                const lojasGrupo = [principal, ...grupo.map(m => m.lojaMescladaId || m.LojaMescladaID)];
                const nomes = [...new Set(lojasGrupo.map(id => lojaCodigo(id, lojas)))];
                const inicio = primeiro.dataInicio || primeiro.DataInicio;
                const medidor = primeiro.medidorUnificado || primeiro.MedidorUnificado;

                html += `<div class="card-loja">
                    <strong>${escapeHtml(nomes.join(" + "))}</strong>
                    <p>${ativa ? "Unificadas" : "Mesclagem desfeita"} desde ${formatarDataBR(inicio)} — Medidor ${escapeHtml(medidor)}</p>
                    ${ativa ? `<button class="btn-desativar btn-pequeno" onclick="desfazerMesclagem('${primeiro.id}')">Desfazer mesclagem</button>` : ""}
                </div>`;
            });

            if (html) {
                div.innerHTML = `<hr><h3>Mesclagens de medidores</h3>${html}`;
                detalhes.appendChild(div);
            }
            adicionarBotaoMesclar();
        } catch (error) {
            console.error("Erro ao carregar mesclagens:", error);
            adicionarBotaoMesclar();
        }
    }

    const originalSelecionarUnidade = window.selecionarUnidade;
    window.selecionarUnidade = async function (id) {
        const resultado = await originalSelecionarUnidade(id);
        await atualizarSecaoMesclagens();
        return resultado;
    };

    const originalPrepararNovaLeituraDados = window.prepararNovaLeituraDados;
    if (typeof originalPrepararNovaLeituraDados === "function") {
        window.prepararNovaLeituraDados = async function (unidadeId) {
            const itens = await originalPrepararNovaLeituraDados(unidadeId);
            const [mesclagens, lojasDaUnidade] = await Promise.all([
                listarMesclagens(unidadeId),
                listarLojasDados(unidadeId)
            ]);
            const dataReferencia = hojeISO();
            const grupos = new Map();

            itens.forEach(item => {
                const merge = obterMesclagemDaLoja(item.lojaId, dataReferencia, mesclagens);
                if (!merge) {
                    grupos.set(`loja-${item.lojaId}`, item);
                    return;
                }

                const principal = String(merge.lojaPrincipalId || merge.LojaPrincipalID);
                const chave = `merge-${chaveMesclagemGrupo(merge)}`;
                if (!grupos.has(chave)) {
                    const grupoAtivo = mesclagens.filter(m =>
                        mesclagemAtivaNaData(m, dataReferencia) && chaveMesclagemGrupo(m) === chaveMesclagemGrupo(merge)
                    );
                    const idsGrupo = [principal, ...grupoAtivo.map(m => String(m.lojaMescladaId || m.LojaMescladaID))];
                    const principalItem = itens.find(i => String(i.lojaId) === principal) || item;
                    grupos.set(chave, {
                        ...principalItem,
                        lojaId: principal,
                        lojaCodigo: idsGrupo.map(id => lojaCodigo(id, lojasDaUnidade)).join(" + "),
                        medidor: merge.medidorUnificado || merge.MedidorUnificado,
                        mesclagemId: merge.id,
                        lojasMescladas: idsGrupo.map(Number)
                    });
                }
            });
            return Array.from(grupos.values());
        };
    }

    window.abrirModalMesclagem = abrirModalMesclagem;
    window.salvarMesclagem = salvarMesclagem;
    window.desfazerMesclagem = desfazerMesclagem;
    window.atualizarMedidoresMesclagem = atualizarMedidoresMesclagem;
})();
