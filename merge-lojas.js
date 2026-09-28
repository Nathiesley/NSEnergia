(function () {
    const TABELA_MESCLAGENS = 'MERGE_MEDIDORES';
    let modalInicializado = false;
    let mesclagensCache = [];

    function escapeHtml(valor) {
        return String(valor ?? '').replace(/[&<>\'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
    }

    async function listarMesclagens(unidadeId) {
        const { data, error } = await db.from(TABELA_MESCLAGENS).select('*').eq('UnidadeID', unidadeId).order('DataInicio', { ascending: true });
        if (error) throw error;
        return (data || []).map(item => normalizarRegistro(item));
    }

    function obterMesclagemDaLoja(lojaId, data, mesclagens) {
        const ref = new Date(`${data}T00:00:00`);
        return mesclagens.find(m => {
            if (String(m.status || m.Status) !== 'Ativa') return false;
            const inicioValor = m.dataInicio || m.DataInicio;
            const fimValor = m.dataFim || m.DataFim;
            const inicio = new Date(`${inicioValor}T00:00:00`);
            const fim = fimValor ? new Date(`${fimValor}T00:00:00`) : null;
            if (ref < inicio || (fim && ref > fim)) return false;
            return String(m.lojaPrincipalId || m.LojaPrincipalID) === String(lojaId) || String(m.lojaMescladaId || m.LojaMescladaID) === String(lojaId);
        }) || null;
    }

    function lojaCodigo(lojaId, lista) {
        return lista.find(l => String(l.id) === String(lojaId))?.codigoLoja || `Loja ${lojaId}`;
    }

    function criarModalSeNecessario() {
        if (modalInicializado) return;
        modalInicializado = true;
        document.body.insertAdjacentHTML('beforeend', `
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
        document.addEventListener('change', event => {
            if (event.target.closest('#mesclaLojas')) atualizarMedidoresMesclagem();
        });
    }

    function atualizarMedidoresMesclagem() {
        const ids = Array.from(document.querySelectorAll('#mesclaLojas input[type="checkbox"]:checked')).map(i => String(i.value));
        const lojasDaUnidade = window._lojasMesclagem || [];
        const candidatos = lojasDaUnidade.filter(l => ids.includes(String(l.id)));
        const select = $("mesclaMedidor");
        select.innerHTML = candidatos.map(l => `<option value="${escapeHtml(l.medidor || '')}">${escapeHtml(l.codigoLoja)} — Medidor ${escapeHtml(l.medidor || '-')}</option>`).join('');
        select.disabled = candidatos.length < 2;
        $("mesclaAviso").innerText = candidatos.length < 2 ? 'Marque pelo menos duas lojas.' : 'Escolha qual dos medidores será mantido.';
    }

    async function abrirModalMesclagem() {
        if (!unidadeSelecionada) return;
        const lojasDaUnidade = await listarLojasDados(unidadeSelecionada.id);
        if (lojasDaUnidade.length < 2) {
            alert('É necessário ter pelo menos duas lojas na unidade para mesclar.');
            return;
        }
        criarModalSeNecessario();
        $("mesclaLojas").innerHTML = lojasDaUnidade.map(l => `<label class="merge-check"><input type="checkbox" value="${l.id}"> <strong>${escapeHtml(l.codigoLoja)}</strong> — Medidor ${escapeHtml(l.medidor || '-')}</label>`).join('');
        $("mesclaMedidor").innerHTML = '<option value="">Selecione as lojas primeiro</option>';
        $("mesclaMedidor").disabled = true;
        $("mesclaData").value = hojeISO();
        $("mesclaAviso").innerText = 'Marque as lojas que passaram a compartilhar o mesmo medidor.';
        $("modalMesclagem").style.display = 'flex';
        window._lojasMesclagem = lojasDaUnidade;
    }

    async function salvarMesclagem() {
        const dataInicio = $("mesclaData").value;
        const lojaIds = Array.from(document.querySelectorAll('#mesclaLojas input[type="checkbox"]:checked')).map(i => Number(i.value));
        const medidorUnificado = $("mesclaMedidor").value;
        if (!dataInicio || lojaIds.length < 2 || !medidorUnificado) {
            alert('Selecione pelo menos duas lojas, a data da unificação e o medidor que será mantido.');
            return;
        }
        const existente = await listarMesclagens(unidadeSelecionada.id);
        const conflitos = existente.filter(m => String(m.status || m.Status) === 'Ativa' && lojaIds.some(id => [m.lojaPrincipalId || m.LojaPrincipalID, m.lojaMescladaId || m.LojaMescladaID].map(String).includes(String(id))));
        if (conflitos.length) {
            alert('Uma ou mais lojas já participam de uma mesclagem ativa. Desfaça a mesclagem anterior antes de criar outra.');
            return;
        }
        const principal = lojaIds[0];
        const registros = lojaIds.filter(id => id !== principal).map(id => ({
            UnidadeID: unidadeSelecionada.id,
            LojaPrincipalID: principal,
            LojaMescladaID: id,
            DataInicio: dataInicio,
            MedidorUnificado: medidorUnificado,
            Status: 'Ativa'
        }));
        const { error } = await db.from(TABELA_MESCLAGENS).insert(registros);
        if (error) throw error;
        $("modalMesclagem").style.display = 'none';
        alert(`Mesclagem criada. A partir de ${formatarDataBR(dataInicio)}, as lojas selecionadas usarão o medidor ${medidorUnificado}.`);
        await selecionarUnidade(unidadeSelecionada.id);
    }

    async function desfazerMesclagem(id) {
        const merge = mesclagensCache.find(m => String(m.id) === String(id));
        if (!merge) return;
        const inicio = merge.dataInicio || merge.DataInicio;
        if (!confirm(`Desfazer a mesclagem iniciada em ${formatarDataBR(inicio)}? O histórico anterior será preservado e a partir de hoje as lojas voltarão a ser tratadas separadamente.`)) return;
        const { error } = await db.from(TABELA_MESCLAGENS).update({ Status: 'Desfeita', DataFim: hojeISO() }).eq('ID', id);
        if (error) throw error;
        alert('Mesclagem desfeita. O histórico foi preservado.');
        await selecionarUnidade(unidadeSelecionada.id);
    }

    function adicionarBotaoMesclar() {
        const detalhes = $("detalhesUnidade");
        if (!detalhes || !unidadeSelecionada) return;
        if (!detalhes.querySelector('#btnMesclarLojas')) {
            const btn = document.createElement('button');
            btn.id = 'btnMesclarLojas';
            btn.className = 'btn-nova-loja';
            btn.innerText = 'Mesclar lojas';
            btn.onclick = abrirModalMesclagem;
            const btnInserir = detalhes.querySelector('.btn-nova-loja');
            if (btnInserir) btnInserir.parentNode.insertBefore(btn, btnInserir.nextSibling);
            else detalhes.appendChild(btn);
        }
    }

    async function atualizarSecaoMesclagens() {
        if (!unidadeSelecionada) return;
        try {
            mesclagensCache = await listarMesclagens(unidadeSelecionada.id);
            const detalhes = $("detalhesUnidade");
            if (!detalhes) return;
            const secaoAnterior = detalhes.querySelector('#secaoMesclagens');
            if (secaoAnterior) secaoAnterior.remove();
            const div = document.createElement('div');
            div.id = 'secaoMesclagens';
            const ativas = mesclagensCache.filter(m => String(m.status || m.Status) === 'Ativa');
            const desfeitas = mesclagensCache.filter(m => String(m.status || m.Status) === 'Desfeita');
            let html = '<hr><h3>Mesclagens de medidores</h3>';
            if (!ativas.length && !desfeitas.length) html = '';
            ativas.forEach(m => {
                html += `<div class="card-loja"><strong>${escapeHtml(lojaCodigo(m.lojaPrincipalId || m.LojaPrincipalID, lojas))} + ${escapeHtml(lojaCodigo(m.lojaMescladaId || m.LojaMescladaID, lojas))}</strong><p>A partir de ${formatarDataBR(m.dataInicio || m.DataInicio)} — Medidor ${escapeHtml(m.medidorUnificado || m.MedidorUnificado)}</p><button class="btn-desativar btn-pequeno" onclick="desfazerMesclagem('${m.id}')">Desfazer mesclagem</button></div>`;
            });
            if (desfeitas.length) html += `<p><small>${desfeitas.length} mesclagem(ns) desfeita(s) — histórico preservado.</small></p>`;
            div.innerHTML = html;
            if (html) detalhes.appendChild(div);
            adicionarBotaoMesclar();
        } catch (error) {
            console.error('Erro ao carregar mesclagens:', error);
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
    if (typeof originalPrepararNovaLeituraDados === 'function') {
        window.prepararNovaLeituraDados = async function (unidadeId) {
            const itens = await originalPrepararNovaLeituraDados(unidadeId);
            const [mesclagens, lojasDaUnidade] = await Promise.all([listarMesclagens(unidadeId), listarLojasDados(unidadeId)]);
            const dataReferencia = hojeISO();
            const grupos = new Map();
            itens.forEach(item => {
                const merge = obterMesclagemDaLoja(item.lojaId, dataReferencia, mesclagens);
                if (!merge) {
                    grupos.set(`loja-${item.lojaId}`, item);
                    return;
                }
                const principal = String(merge.lojaPrincipalId || merge.LojaPrincipalID);
                const chave = `merge-${merge.id}`;
                if (!grupos.has(chave)) {
                    const principalItem = itens.find(i => String(i.lojaId) === principal) || item;
                    const mescladaId = merge.lojaMescladaId || merge.LojaMescladaID;
                    grupos.set(chave, {
                        ...principalItem,
                        lojaId: principal,
                        lojaCodigo: `${lojaCodigo(principal, lojasDaUnidade)} + ${lojaCodigo(mescladaId, lojasDaUnidade)}`,
                        medidor: merge.medidorUnificado || merge.MedidorUnificado,
                        mesclagemId: merge.id,
                        lojasMescladas: [Number(principal), Number(mescladaId)]
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
