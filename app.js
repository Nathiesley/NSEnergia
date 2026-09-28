const SUPABASE_URL = "https://uoefuvcnjmxzzxstpkqw.supabase.co/rest/v1/";
const SUPABASE_KEY = "sb_publishable_Fvia-EqadUhXzpUSaB_p_w_xBVBMDBd";
const SUPABASE_CLIENT_URL = SUPABASE_URL.replace(/\/rest\/v1\/?$/, "");
const db = supabase.createClient(SUPABASE_CLIENT_URL, SUPABASE_KEY);

const TABELAS = {
    unidades: "UNIDADES",
    lojas: "LOJAS",
    clientes: "CLIENTES",
    ocupacoes: "OCUPACOES",
    leituras: "LEITURAS",
    faturas: "FATURAS",
    rateios: "RATEIOS",
    configuracao: "CONFIGURACAO"
};

let carregamentosAtivos = 0;

let unidades = [];
let unidadeSelecionada = null;
let lojas = [];
let lojaSelecionada = null;
let clientes = [];
let clienteSelecionado = null;
let ocupacoesBrutas = [];
let ocupacoesAgrupadas = [];
let ocupacaoSelecionada = null;
let unidadeLeiturasSelecionada = null;
let unidadeFaturasSelecionada = null;
let unidadeRateiosSelecionada = null;
let itensNovaLeitura = [];
let faturasUnidade = [];
let rateiosUnidade = [];
let dashboardDados = null;
let relatorioAtual = null;
let unidadeOcupacoesSelecionada = null;
let filtroStatusOcupacoes = "Ativa";

function $(id) {
    return document.getElementById(id);
}

function moeda(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function numero(valor, casas) {
    return Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: casas || 0, maximumFractionDigits: casas || 2 });
}

function hojeISO() {
    return new Date().toISOString().slice(0, 10);
}

function competenciaDaData(data) {
    if (!data) return "";
    const partes = data.split("-");
    return `${partes[1]}/${partes[0]}`;
}

function normalizarCompetencia(valor) {
    if (!valor) return "";
    const texto = String(valor).trim().toLowerCase();
    let correspondencia = texto.match(/^(\d{4})-(\d{2})(?:-\d{2})?/);
    if (correspondencia) return `${correspondencia[2]}/${correspondencia[1]}`;
    correspondencia = texto.match(/^(\d{1,2})[\/-](\d{4})$/);
    if (correspondencia) return `${correspondencia[1].padStart(2, "0")}/${correspondencia[2]}`;
    const meses = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const textoSemAcentos = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const mes = meses.findIndex(nome => textoSemAcentos.includes(nome));
    const ano = texto.match(/\b(20\d{2})\b/);
    if (mes >= 0 && ano) return `${String(mes + 1).padStart(2, "0")}/${ano[1]}`;
    const data = new Date(valor);
    if (!Number.isNaN(data.getTime())) return `${String(data.getMonth() + 1).padStart(2, "0")}/${data.getFullYear()}`;
    return texto;
}

function competenciaParaOrdenacao(valor) {
    const competencia = normalizarCompetencia(valor);
    const partes = competencia.match(/^(\d{2})\/(\d{4})$/);
    if (!partes) return 0;
    return Number(partes[2]) * 100 + Number(partes[1]);
}

function faturaMaisRecente(lista) {
    return [...(lista || [])].sort((a, b) => {
        const competencia = competenciaParaOrdenacao(b.competencia) - competenciaParaOrdenacao(a.competencia);
        if (competencia) return competencia;
        const proxima = (dataLocal(b.dataProximaLeitura)?.getTime() || 0) - (dataLocal(a.dataProximaLeitura)?.getTime() || 0);
        if (proxima) return proxima;
        return (dataLocal(b.dataVencimento)?.getTime() || 0) - (dataLocal(a.dataVencimento)?.getTime() || 0);
    })[0];
}

function formatarDataBR(valor) {
    if (!valor) return "-";
    const texto = String(valor).slice(0, 10);
    const partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (partes) return `${partes[3]}/${partes[2]}/${partes[1]}`;
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? String(valor) : data.toLocaleDateString("pt-BR");
}

function dataISO(valor) {
    const data = dataLocal(valor);
    if (!data) return "";
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, "0");
    const dia = String(data.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
}

function somarDiasISO(valor, dias) {
    const data = dataLocal(valor);
    if (!data) return "";
    data.setDate(data.getDate() + dias);
    return dataISO(data);
}

function formatarCompetenciaExtenso(valor) {
    const competencia = normalizarCompetencia(valor);
    const partes = competencia.match(/^(\d{2})\/(\d{4})$/);
    if (!partes) return competencia || "-";
    const data = new Date(Number(partes[2]), Number(partes[1]) - 1, 1);
    const nome = data.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return nome.charAt(0).toUpperCase() + nome.slice(1);
}

function compararLojas(a, b) {
    return String(a || "").localeCompare(String(b || ""), "pt-BR", { numeric: true, sensitivity: "base" });
}

function mesmoId(a, b) {
    return String(a ?? "").trim() === String(b ?? "").trim();
}

function dataLocal(valor) {
    if (!valor) return null;
    const iso = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? null : data;
}

function clienteDaLojaNaData(listaOcupacoes, lojaId, dataReferencia) {
    const data = dataLocal(dataReferencia);
    if (!data) return "Loja vaga";
    const ocupacao = listaOcupacoes.find(item => {
        if (!mesmoId(item.lojaId, lojaId)) return false;
        const inicio = dataLocal(item.dataInicio);
        const fim = dataLocal(item.dataFim);
        return inicio && inicio <= data && (!fim || fim >= data);
    });
    return ocupacao?.clienteNome || "Loja vaga";
}

function ocupacaoDaLojaNaData(listaOcupacoes, lojaId, dataReferencia) {
    const data = dataLocal(dataReferencia) || dataLocal(hojeISO());
    if (!data) return null;
    return listaOcupacoes
        .filter(item => mesmoId(item.lojaId, lojaId))
        .filter(item => {
            const inicio = dataLocal(item.dataInicio);
            const fim = dataLocal(item.dataFim);
            return inicio && inicio <= data && (!fim || fim >= data);
        })
        .sort((a, b) => (dataLocal(b.dataInicio)?.getTime() || 0) - (dataLocal(a.dataInicio)?.getTime() || 0))[0] || null;
}

function valorCampo(registro, nomes, padrao = "") {
    for (const nome of nomes) {
        if (registro && registro[nome] !== undefined && registro[nome] !== null) return registro[nome];
    }
    return padrao;
}

function normalizarRegistro(registro) {
    if (!registro) return {};
    return {
        ...registro,
        id: valorCampo(registro, ["id", "ID"]),
        nome: valorCampo(registro, ["nome", "Nome"]),
        endereco: valorCampo(registro, ["endereco", "Endereco", "Endereço"]),
        instalacaoCemig: valorCampo(registro, ["instalacaoCemig", "InstalacaoCemig", "InstalaçãoCemig", "Instalacao", "Instalação"]),
        observacoes: valorCampo(registro, ["observacoes", "Observacoes", "Observações"]),
        status: valorCampo(registro, ["status", "Status"], "Ativa"),
        unidadeId: valorCampo(registro, ["unidadeId", "UnidadeID", "UnidadeId"]),
        unidadeNome: valorCampo(registro, ["unidadeNome", "UnidadeNome"]),
        clienteId: valorCampo(registro, ["clienteId", "ClienteID", "ClienteId"]),
        clienteNome: valorCampo(registro, ["clienteNome", "ClienteNome"]),
        lojaId: valorCampo(registro, ["lojaId", "LojaID", "LojaId"]),
        lojaCodigo: valorCampo(registro, ["lojaCodigo", "LojaCodigo", "CodigoLoja", "CódigoLoja"]),
        codigoLoja: valorCampo(registro, ["codigoLoja", "CodigoLoja", "CódigoLoja"]),
        medidor: valorCampo(registro, ["medidor", "Medidor", "NumeroMedidor", "NúmeroMedidor"]),
        ordem: valorCampo(registro, ["ordem", "Ordem"]),
        documento: String(valorCampo(registro, ["documento", "Documento", "CPF_CNPJ", "CpfCnpj"], "")),
        telefone: String(valorCampo(registro, ["telefone", "Telefone"], "")),
        email: valorCampo(registro, ["email", "Email", "E-mail"]),
        dataInicio: valorCampo(registro, ["dataInicio", "DataInicio", "DataInício"]),
        dataFim: valorCampo(registro, ["dataFim", "DataFim"]),
        leituraInicial: valorCampo(registro, ["leituraInicial", "LeituraInicial"]),
        leituraFinal: valorCampo(registro, ["leituraFinal", "LeituraFinal"]),
        competencia: normalizarCompetencia(valorCampo(registro, ["competencia", "Competencia"])),
        dataLeituraAtual: valorCampo(registro, ["dataLeituraAtual", "DataLeituraAtual"]),
        dataLeituraAnterior: valorCampo(registro, ["dataLeituraAnterior", "DataLeituraAnterior"]),
        leituraAnterior: valorCampo(registro, ["leituraAnterior", "LeituraAnterior"], 0),
        leituraAtual: valorCampo(registro, ["leituraAtual", "LeituraAtual"], 0),
        consumo: valorCampo(registro, ["consumo", "Consumo"], 0),
        valorConta: valorCampo(registro, ["valorConta", "ValorConta"], 0),
        consumoTotal: valorCampo(registro, ["consumoTotal", "ConsumoTotal"], 0),
        valorKwh: valorCampo(registro, ["valorKwh", "ValorKwh", "ValorKWH"], 0),
        dataProximaLeitura: valorCampo(registro, ["dataProximaLeitura", "DataProximaLeitura", "DataPróximaLeitura"]),
        dataVencimento: valorCampo(registro, ["dataVencimento", "DataVencimento"]),
        ocupacaoId: valorCampo(registro, ["ocupacaoId", "OcupacaoID", "OcupaçãoID"]),
        periodoInicio: valorCampo(registro, ["periodoInicio", "PeriodoInicio", "PeríodoInicio"]),
        periodoFim: valorCampo(registro, ["periodoFim", "PeriodoFim", "PeríodoFim"]),
        valorRateado: valorCampo(registro, ["valorRateado", "ValorRateado"], 0),
        situacao: valorCampo(registro, ["situacao", "Situacao", "Situação"]),
        ultimaLeitura: valorCampo(registro, ["ultimaLeitura", "UltimaLeitura", "ÚltimaLeitura"]),
        proximaLeitura: valorCampo(registro, ["proximaLeitura", "ProximaLeitura", "PróximaLeitura", "DataProximaLeitura", "DataPróximaLeitura"])
    };
}

function normalizarLista(lista) {
    return (lista || []).map(normalizarRegistro);
}

function soNumeros(valor) {
    return String(valor || "").replace(/\D/g, "");
}

function falhaSupabase(contexto, erro) {
    console.error(contexto, erro);
    const detalhe = erro?.message ? ` ${erro.message}` : "";
    alert(`${contexto}.${detalhe}`);
}

function definirCarregando(ativo, mensagem = "Carregando...") {
    carregamentosAtivos += ativo ? 1 : -1;
    carregamentosAtivos = Math.max(0, carregamentosAtivos);
    let overlay = $("loadingGlobal");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "loadingGlobal";
        overlay.className = "loading-global";
        overlay.innerHTML = `<div class="loading-caixa"><span class="spinner"></span><strong id="loadingMensagem"></strong></div>`;
        document.body.appendChild(overlay);
    }
    const estaCarregando = carregamentosAtivos > 0;
    overlay.style.display = estaCarregando ? "flex" : "none";
    if ($("loadingMensagem")) $("loadingMensagem").innerText = mensagem;
    document.querySelectorAll("button").forEach(botao => {
        botao.disabled = estaCarregando;
        botao.classList.toggle("carregando", estaCarregando);
    });
}

async function executarComLoading(mensagem, operacao) {
    definirCarregando(true, mensagem);
    try {
        return await operacao();
    } finally {
        definirCarregando(false);
    }
}

async function consultarTabela(tabela, opcoes = {}) {
    let consulta = db.from(tabela).select("*");
    if (opcoes.eq) {
        Object.entries(opcoes.eq).forEach(([campo, valor]) => {
            if (valor !== undefined && valor !== null && valor !== "") consulta = consulta.eq(campo, valor);
        });
    }
    if (opcoes.order) consulta = consulta.order(opcoes.order.campo, { ascending: opcoes.order.ascendente !== false });
    const { data, error } = await consulta;
    if (error) throw error;
    return normalizarLista(data);
}

async function inserirRegistro(tabela, dados) {
    const { data, error } = await db.from(tabela).insert([dados]).select();
    if (error) throw error;
    return normalizarRegistro(data?.[0]);
}

async function atualizarRegistro(tabela, id, dados) {
    const colunaId =
    tabela === TABELAS.faturas || tabela === TABELAS.ocupacoes
        ? "ID"
        : "id";

    const { data, error } = await db
        .from(tabela)
        .update(dados)
        .eq(colunaId, id)
        .select();

    if (error) throw error;
    return normalizarRegistro(data?.[0]);
}

async function excluirRegistro(tabela, id) {
    const { error } = await db.from(tabela).delete().eq("ID", id);
    if (error) throw error;
}

async function excluirRateiosPorCompetencia(unidadeId, competencia) {
    const { error } = await db
        .from(TABELAS.rateios)
        .delete()
        .eq("UnidadeID", unidadeId)
        .eq("Competencia", competencia);
    if (error) throw error;
}

async function listarUnidadesDados() {
    return consultarTabela(TABELAS.unidades, { order: { campo: "Nome" } });
}

async function listarClientesDados() {
    return consultarTabela(TABELAS.clientes, { order: { campo: "Nome" } });
}

async function listarLojasDados(unidadeId = "") {
    const lojasDados = await consultarTabela(TABELAS.lojas, {
        eq: unidadeId ? { UnidadeID: unidadeId } : {},
        order: { campo: "Ordem" }
    });
    return lojasDados.sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0) || compararLojas(a.codigoLoja, b.codigoLoja));
}

async function listarOcupacoesDados() {
    const [ocupacoes, clientesDados, unidadesDados, lojasDados] = await Promise.all([
        consultarTabela(TABELAS.ocupacoes),
        listarClientesDados(),
        listarUnidadesDados(),
        consultarTabela(TABELAS.lojas)
    ]);
    const clientesPorId = new Map(clientesDados.map(item => [String(item.id), item]));
    const unidadesPorId = new Map(unidadesDados.map(item => [String(item.id), item]));
    const lojasPorId = new Map(lojasDados.map(item => [String(item.id), item]));
    return ocupacoes.map(ocupacao => {
        const cliente = clientesPorId.get(String(ocupacao.clienteId));
        const unidade = unidadesPorId.get(String(ocupacao.unidadeId));
        const loja = lojasPorId.get(String(ocupacao.lojaId));
        return normalizarRegistro({
            ...ocupacao,
            id: ocupacao.id,
            ocupacaoId: ocupacao.id,
            clienteId: ocupacao.clienteId,
            clienteNome: cliente?.nome || ocupacao.clienteNome,
            unidadeId: ocupacao.unidadeId || loja?.unidadeId,
            unidadeNome: unidade?.nome || ocupacao.unidadeNome,
            lojaId: ocupacao.lojaId,
            lojaCodigo: loja?.codigoLoja || ocupacao.lojaCodigo,
            medidor: loja?.medidor,
            dataInicio: ocupacao.dataInicio,
            dataFim: ocupacao.dataFim,
            status: ocupacao.status || "Ativa",
            leituraInicial: ocupacao.leituraInicial,
            leituraFinal: ocupacao.leituraFinal
        });
    });
}

async function listarLeiturasDados(unidadeId = "") {
    const leiturasDados = await consultarTabela(TABELAS.leituras, unidadeId ? { eq: { UnidadeID: unidadeId } } : {});
    return leiturasDados.sort((a, b) => String(b.competencia).localeCompare(String(a.competencia)));
}

async function listarFaturasDados(unidadeId = "") {
    const faturasDados = await consultarTabela(TABELAS.faturas, unidadeId ? { eq: { UnidadeID: unidadeId } } : {});
    return faturasDados.sort((a, b) => String(b.competencia).localeCompare(String(a.competencia)));
}

async function listarRateiosDados(unidadeId = "") {
    const rateiosDados = await consultarTabela(TABELAS.rateios, unidadeId ? { eq: { UnidadeID: unidadeId } } : {});
    return rateiosDados.sort((a, b) => String(b.competencia).localeCompare(String(a.competencia)));
}

async function prepararNovaLeituraDados(unidadeId) {
    const [lojasDaUnidade, leiturasDaUnidade, ocupacoes] = await Promise.all([
        listarLojasDados(unidadeId),
        listarLeiturasDados(unidadeId),
        listarOcupacoesDados()
    ]);
    return lojasDaUnidade
        .filter(loja => String(loja.status || "Ativa") !== "Inativa")
        .map(loja => {
            const historico = leiturasDaUnidade
                .filter(leitura => mesmoId(leitura.lojaId, loja.id))
                .sort((a, b) => (dataLocal(b.dataLeituraAtual)?.getTime() || 0) - (dataLocal(a.dataLeituraAtual)?.getTime() || 0));
            const anterior = historico[0];
            const ocupacaoAtual = ocupacaoDaLojaNaData(ocupacoes, loja.id, hojeISO());
            const leituraAnterior = anterior ? Number(anterior.leituraAtual || 0) : Number(ocupacaoAtual?.leituraInicial || 0);
            const dataLeituraAnterior = anterior?.dataLeituraAtual || ocupacaoAtual?.dataInicio || "-";
            return {
                lojaId: loja.id,
                lojaCodigo: loja.codigoLoja,
                medidor: loja.medidor,
                clienteAtual: ocupacaoAtual?.clienteNome || clienteDaLojaNaData(ocupacoes, loja.id, hojeISO()),
                dataLeituraAnterior,
                leituraAnterior
            };
        });
}

async function obterDashboardDados() {
    const [unidadesDados, lojasDados, clientesDados, ocupacoesDados, leiturasDados, faturasDados] = await Promise.all([
        listarUnidadesDados(),
        consultarTabela(TABELAS.lojas),
        listarClientesDados(),
        listarOcupacoesDados(),
        listarLeiturasDados(),
        listarFaturasDados()
    ]);
    const ocupacoesAtivas = ocupacoesDados.filter(item => item.status !== "Encerrada" && item.status !== "Inativa");
    const competencias = leiturasDados.map(item => normalizarCompetencia(item.competencia)).filter(Boolean).sort();
    const ultimaCompetencia = competencias[competencias.length - 1] || "";
    const consumoUltimaCompetencia = leiturasDados
        .filter(item => normalizarCompetencia(item.competencia) === ultimaCompetencia)
        .reduce((soma, item) => soma + Number(item.consumo || 0), 0);
    const faturasUltimaCompetencia = faturasDados.filter(item => normalizarCompetencia(item.competencia) === ultimaCompetencia);
    const valorMedioKwhUltimaCompetencia = faturasUltimaCompetencia.reduce((soma, item) => soma + Number(item.valorKwh || 0), 0) / (faturasUltimaCompetencia.length || 1);
    const unidadesAtivas = unidadesDados.filter(
    unidade => String(unidade.status || "").toLowerCase() !== "inativa"
);
	const proximasLeituras = unidadesAtivas.map(unidade => {
        const leiturasUnidade = leiturasDados
            .filter(item => mesmoId(item.unidadeId, unidade.id))
            .sort((a, b) => (dataLocal(b.dataLeituraAtual)?.getTime() || 0) - (dataLocal(a.dataLeituraAtual)?.getTime() || 0));
        const faturaReferencia = faturaMaisRecente(faturasDados.filter(item => mesmoId(item.unidadeId, unidade.id)));
        const ultimaLeitura = dataISO(unidade.ultimaLeitura || leiturasUnidade[0]?.dataLeituraAtual);
        const proximaLeitura = dataISO(faturaReferencia?.dataProximaLeitura) || dataISO(unidade.proximaLeitura) || somarDiasISO(ultimaLeitura, 30);
        return {
            unidadeId: unidade.id,
            unidadeNome: unidade.nome,
            ultimaLeitura,
            proximaLeitura,
            status: "Leitura Pendente",
            classe: "pendente"
        };
    });
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const proximasLeituras7Dias = proximasLeituras.filter(item => {
        const data = dataLocal(item.proximaLeitura);
        if (!data) return false;
        const limite = new Date(hoje);
        limite.setDate(limite.getDate() + 7);
        return data >= hoje && data <= limite;
    }).length;
    const leiturasHoje = proximasLeituras.filter(item => dataLocal(item.proximaLeitura)?.getTime() === hoje.getTime()).length;
    const leiturasVencidas = proximasLeituras.filter(item => {
        const data = dataLocal(item.proximaLeitura);
        return data && data < hoje;
    }).length;
    return {
        totalUnidades: unidadesAtivas.length,
        totalLojas: lojasDados.length,
        lojasOcupadas: ocupacoesAtivas.length,
        lojasVagas: Math.max(0, lojasDados.length - ocupacoesAtivas.length),
        clientesAtivos: clientesDados.filter(item => !["Inativo", "Arquivado"].includes(item.status)).length,
        consumoUltimaCompetencia,
        valorMedioKwhUltimaCompetencia,
        ultimaCompetencia,
        leiturasVencidas,
        leiturasHoje,
        proximasLeituras7Dias,
        proximasLeituras
    };
}

function validarClientePayload(payload) {
    const documento = soNumeros(payload.documento);
    const telefone = soNumeros(payload.telefone);
    if (!payload.nome || !documento || !telefone || !payload.email || !payload.status) {
        throw new Error("Preencha Nome, Documento, Telefone, E-mail e Status.");
    }
    if (![11, 14].includes(documento.length)) throw new Error("CPF deve ter 11 digitos e CNPJ deve ter 14 digitos.");
    if (![10, 11].includes(telefone.length)) throw new Error("Telefone deve ter 10 ou 11 digitos.");
    return { documento, telefone };
}

async function salvarClienteDados(payload) {
    const status = payload.status || "Ativo";
    const validado = validarClientePayload({ ...payload, status });
    const clientesDados = await listarClientesDados();
    const duplicado = clientesDados.some(cliente => soNumeros(cliente.documento) === validado.documento && !mesmoId(cliente.id, payload.id));
    if (duplicado) throw new Error("Ja existe cliente com este documento.");
    const dados = {
        Nome: payload.nome,
        Documento: validado.documento,
        Telefone: validado.telefone,
        Email: payload.email,
        Observacoes: payload.observacoes || "",
        Status: status
    };
    return payload.id ? atualizarRegistro(TABELAS.clientes, payload.id, dados) : inserirRegistro(TABELAS.clientes, dados);
}

async function gerarRateioDados(unidadeId, competencia) {
    const [faturasDados, leiturasDados, ocupacoesDados, lojasDaUnidade] = await Promise.all([
        listarFaturasDados(unidadeId),
        listarLeiturasDados(unidadeId),
        listarOcupacoesDados(),
        listarLojasDados(unidadeId)
    ]);
    const fatura = faturasDados.find(item => String(item.unidadeId).trim() === String(unidadeId).trim() && normalizarCompetencia(item.competencia) === competencia);
    if (!fatura) throw new Error("Nao existe fatura para esta competencia e unidade.");
    const leiturasCompetencia = leiturasDados.filter(item => normalizarCompetencia(item.competencia) === competencia);
    if (!leiturasCompetencia.length) throw new Error("Nao existem leituras para esta competencia.");
    const valorKwh = Number(fatura.valorKwh || (Number(fatura.valorConta || 0) / Number(fatura.consumoTotal || 1)));
    const lojasPorId = new Map(lojasDaUnidade.map(loja => [String(loja.id), loja]));
    const registros = leiturasCompetencia.map(leitura => {
        const ocupacao = ocupacoesDados.find(item => mesmoId(item.lojaId, leitura.lojaId) && item.status !== "Encerrada");
        const loja = lojasPorId.get(String(leitura.lojaId));
        const consumo = Number(leitura.consumo || (Number(leitura.leituraAtual) - Number(leitura.leituraAnterior)) || 0);
        return {
            UnidadeID: unidadeId,
            Competencia: competencia,
            OcupacaoID: ocupacao?.ocupacaoId || ocupacao?.id || null,
            LojaID: leitura.lojaId,
            LojaCodigo: loja?.codigoLoja || leitura.lojaCodigo || "",
            ClienteNome: ocupacao?.clienteNome || "Vaga / area comum",
            PeriodoInicio: leitura.dataLeituraAnterior || "",
            PeriodoFim: leitura.dataLeituraAtual || "",
            Consumo: consumo,
            ValorKwh: valorKwh,
            ValorRateado: consumo * valorKwh,
            Situacao: "Concluido"
        };
    });
    const { error } = await db.from(TABELAS.rateios).insert(registros);
    if (error) throw error;
    return registros;
}

async function gerarRelatorioDados(filtros) {
    const rateios = await listarRateiosDados(filtros.unidadeId || "");
    const linhas = rateios.filter(linha => {
        if (filtros.competencia && normalizarCompetencia(linha.competencia) !== filtros.competencia) return false;
        if (filtros.ocupacaoId && !mesmoId(linha.ocupacaoId, filtros.ocupacaoId)) return false;
        return true;
    });
    const resumo = {
        competencia: filtros.competencia || "Todas",
        consumoTotal: linhas.reduce((soma, linha) => soma + Number(linha.consumo || 0), 0),
        valorTotalRateado: linhas.reduce((soma, linha) => soma + Number(linha.valorRateado || 0), 0),
        registros: linhas.length,
        quantidadeLojas: new Set(linhas.map(linha => linha.lojaId)).size,
        quantidadeLojasVagas: linhas.filter(linha => !linha.clienteNome || linha.clienteNome.includes("Vaga")).length
    };
    return {
        tipo: filtros.tipo,
        titulo: `Relatorio ${filtros.tipo || "geral"}`,
        resumo,
        linhas
    };
}

async function getJSON(action, params = {}) {
    return executarComLoading("Carregando dados...", async () => {
        try {
            const acoes = {
                listarUnidades: () => listarUnidadesDados(),
                listarLojas: () => listarLojasDados(params.unidadeId),
                listarClientes: () => listarClientesDados(),
                listarOcupacoes: () => listarOcupacoesDados(),
                listarLeituras: () => listarLeiturasDados(params.unidadeId),
                listarFaturas: () => listarFaturasDados(params.unidadeId),
                listarRateios: () => listarRateiosDados(params.unidadeId),
                prepararNovaLeitura: () => prepararNovaLeituraDados(params.unidadeId),
                obterDashboard: () => obterDashboardDados(),
                gerarRelatorio: () => gerarRelatorioDados(params)
            };
            if (!acoes[action]) throw new Error(`Acao Supabase nao implementada: ${action}`);
            return await acoes[action]();
        } catch (erro) {
            falhaSupabase("Nao foi possivel carregar os dados", erro);
            throw erro;
        }
    });
}

async function postJSON(payload) {
    return executarComLoading("Salvando dados...", async () => {
        try {
            const acoes = {
                cadastrarUnidade: () => inserirRegistro(TABELAS.unidades, { Nome: payload.nome, Endereco: payload.endereco, InstalacaoCemig: payload.instalacaoCemig, Observacoes: payload.observacoes, Status: "Ativa" }),
                editarUnidade: () => atualizarRegistro(TABELAS.unidades, payload.id, { Nome: payload.nome, Endereco: payload.endereco, InstalacaoCemig: payload.instalacaoCemig, Observacoes: payload.observacoes }),
                desativarUnidade: () => atualizarRegistro(TABELAS.unidades, payload.id, { Status: "Inativa" }),
                cadastrarLoja: () => inserirRegistro(TABELAS.lojas, { UnidadeID: payload.unidadeId, CodigoLoja: payload.codigoLoja, Medidor: payload.medidor, Ordem: payload.ordem, Status: "Ativa" }),
                cadastrarCliente: () => salvarClienteDados({ ...payload, status: "Ativo" }),
                editarCliente: () => salvarClienteDados({ ...payload, status: payload.status || "Ativo" }),
                desativarCliente: () => atualizarRegistro(TABELAS.clientes, payload.id, { Status: "Inativo" }),
                cadastrarOcupacao: () => inserirRegistro(TABELAS.ocupacoes, {
                    ClienteID: payload.clienteId,
                    UnidadeID: payload.unidadeId,
                    LojaID: payload.lojaId,
                    DataInicio: payload.dataInicio,
                    LeituraInicial: payload.leituraInicial,
                    Status: "Ativa"
                }),
                encerrarOcupacao: () => atualizarRegistro(TABELAS.ocupacoes, payload.id, { DataFim: payload.dataFim, LeituraFinal: payload.leituraFinal, Status: "Encerrada" }),
                cadastrarLeitura: async () => {
                    const registros = payload.itens.map(item => ({
                        UnidadeID: payload.unidadeId,
                        LojaID: item.lojaId,
                        Competencia: payload.competencia,
                        DataLeituraAnterior: item.dataLeituraAnterior === "-" ? null : item.dataLeituraAnterior,
                        DataLeituraAtual: payload.dataLeituraAtual,
                        LeituraAnterior: item.leituraAnterior,
                        LeituraAtual: item.leituraAtual,
                        Consumo: Number(item.leituraAtual || 0) - Number(item.leituraAnterior || 0)
                    }));
                    const { error } = await db.from(TABELAS.leituras).insert(registros);
                    if (error) throw error;
                },
                cadastrarFatura: () => {
                    const valorConta = Number(payload.valorConta);
                    const consumoTotal = Number(payload.consumoTotal);
                    return inserirRegistro(TABELAS.faturas, {
                        UnidadeID: payload.unidadeId,
                        Competencia: payload.competencia,
                        ValorConta: valorConta,
                        ConsumoTotal: consumoTotal,
                        ValorKwh: consumoTotal ? valorConta / consumoTotal : 0,
                        DataLeituraAtual: payload.dataLeituraAtual,
                        DataProximaLeitura: payload.dataProximaLeitura,
                        DataVencimento: payload.dataVencimento
                    });
                },
                editarLeitura: () => atualizarRegistro(TABELAS.leituras, payload.id, {
                    LeituraAtual: payload.leituraAtual,
                    Consumo: Number(payload.leituraAtual || 0) - Number(payload.leituraAnterior || 0)
                }),
                editarFatura: () => {
                    const valorConta = Number(payload.valorConta);
                    const consumoTotal = Number(payload.consumoTotal);
                    return atualizarRegistro(TABELAS.faturas, payload.id, {
                        Competencia: payload.competencia,
                        ValorConta: valorConta,
                        ConsumoTotal: consumoTotal,
                        ValorKwh: consumoTotal ? valorConta / consumoTotal : 0,
                        DataLeituraAtual: payload.dataLeituraAtual,
                        DataProximaLeitura: payload.dataProximaLeitura,
                        DataVencimento: payload.dataVencimento
                    });
                },
                gerarRateio: () => gerarRateioDados(payload.unidadeId, payload.competencia),
                excluirLeitura: () => excluirRegistro(TABELAS.leituras, payload.id),
                excluirFatura: () => excluirRegistro(TABELAS.faturas, payload.id),
                excluirRateio: () => excluirRegistro(TABELAS.rateios, payload.id),
                excluirRateioCompetencia: () => excluirRateiosPorCompetencia(payload.unidadeId, payload.competencia)
            };
            if (!acoes[payload.action]) throw new Error(`Acao Supabase nao implementada: ${payload.action}`);
            return await acoes[payload.action]();
        } catch (erro) {
            falhaSupabase("Nao foi possivel salvar as alteracoes", erro);
            throw erro;
        }
    });
}

function alternarMenuAtivo(idMenuAtivo) {
    ["menuDashboard", "menuUnidades", "menuClientes", "menuOcupacoes", "menuLeituras", "menuFaturas", "menuRateios", "menuRelatorios"].forEach(id => {
        const elemento = $(id);
        if (elemento) elemento.classList.toggle("ativo", id === idMenuAtivo);
    });
}

function mostrarTela(idTela) {
    ["telaDashboard", "telaUnidades", "telaClientes", "telaOcupacoes", "telaLeituras", "telaFaturas", "telaRateios", "telaRelatorios"].forEach(id => {
        if ($(id)) $(id).style.display = id === idTela ? "block" : "none";
    });
}

function abrirTelaDashboard() {
    mostrarTela("telaDashboard");
    alternarMenuAtivo("menuDashboard");
    carregarDashboard();
}

function abrirTelaUnidades() {
    mostrarTela("telaUnidades");
    alternarMenuAtivo("menuUnidades");
    listarUnidades();
}

function abrirTelaClientes() {
    mostrarTela("telaClientes");
    alternarMenuAtivo("menuClientes");
    listarClientes();
}

function abrirTelaOcupacoes() {
    mostrarTela("telaOcupacoes");
    alternarMenuAtivo("menuOcupacoes");
    listarOcupacoes();
}

function abrirTelaLeituras() {
    mostrarTela("telaLeituras");
    alternarMenuAtivo("menuLeituras");
    listarUnidadesLeituras();
}

function abrirTelaFaturas() {
    mostrarTela("telaFaturas");
    alternarMenuAtivo("menuFaturas");
    listarUnidadesFaturas();
}

function abrirTelaRateios() {
    mostrarTela("telaRateios");
    alternarMenuAtivo("menuRateios");
    listarUnidadesRateios();
}

function abrirTelaRelatorios() {
    mostrarTela("telaRelatorios");
    alternarMenuAtivo("menuRelatorios");
    carregarFiltrosRelatorios();
}

function abrirModal() {
    if ($("tituloModalUnidade")) $("tituloModalUnidade").innerText = "Nova Unidade";
    if ($("modal")) $("modal").style.display = "flex";
}
function fecharModal() {
    if ($("modal")) $("modal").style.display = "none";
    ["unidadeId", "nome", "endereco", "instalacao", "observacoes"].forEach(id => { if ($(id)) $(id).value = ""; });
}

function abrirModalLoja() {
    if (!unidadeSelecionada) { alert("Selecione uma unidade primeiro."); return; }
    if ($("modalLoja")) $("modalLoja").style.display = "flex";
}
function fecharModalLoja() {
    if ($("modalLoja")) $("modalLoja").style.display = "none";
    ["lojaId", "codigoLoja", "medidorLoja", "ordemLoja"].forEach(id => { if ($(id)) $(id).value = ""; });
}

function abrirModalCliente() {
    if ($("tituloModalCliente")) $("tituloModalCliente").innerText = "Novo Cliente";
    if ($("modalCliente")) $("modalCliente").style.display = "flex";
}
function fecharModalCliente() {
    if ($("modalCliente")) $("modalCliente").style.display = "none";
    ["clienteId", "clienteNome", "clienteDocumento", "clienteTelefone", "clienteEmail", "clienteObservacoes"].forEach(id => { if ($(id)) $(id).value = ""; });
    if ($("clienteStatus")) $("clienteStatus").value = "Ativo";
}

async function abrirModalOcupacao() {
    if ($("blocoEncerramentoOcupacao")) $("blocoEncerramentoOcupacao").style.display = "none";
    if ($("tituloModalOcupacao")) $("tituloModalOcupacao").innerText = "Nova Ocupacao";
    if ($("containerLeiturasIniciais")) $("containerLeiturasIniciais").innerHTML = "";
    if ($("containerLeiturasFinais")) $("containerLeiturasFinais").innerHTML = "";
    await carregarSelectsModalOcupacao();
    if ($("modalOcupacao")) $("modalOcupacao").style.display = "flex";
}
function fecharModalOcupacao() {
    if ($("modalOcupacao")) $("modalOcupacao").style.display = "none";
    ["ocupacaoId", "ocupacaoDataInicio", "ocupacaoDataFim"].forEach(id => { if ($(id)) $(id).value = ""; });
    ["ocupacaoCliente", "ocupacaoUnidade", "containerCheckboxesLojas", "containerLeiturasIniciais", "containerLeiturasFinais"].forEach(id => { if ($(id)) $(id).innerHTML = ""; });
}

async function listarUnidades() {
    try {
        unidades = await getJSON("listarUnidades");
        renderizarUnidades(unidades);
    } catch (erro) {
        console.error("Erro ao listar unidades:", erro);
    }
}

function renderizarUnidades(lista) {
    let html = "";
    lista.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR")).forEach(unidade => {
        html += `
                <div class="card-unidade" onclick="selecionarUnidade(${unidade.id})">
                    <h3>${unidade.nome}</h3>
                    <p>${unidade.endereco || "-"}</p>
                </div>`;
    });
    if ($("listaUnidades")) $("listaUnidades").innerHTML = html || "<p>Nenhuma unidade cadastrada.</p>";
}

function filtrarUnidades() {
    const termo = ($("pesquisaUnidades")?.value || "").trim().toLocaleLowerCase("pt-BR");
    renderizarUnidades(unidades.filter(u => `${u.nome || ""} ${u.endereco || ""}`.toLocaleLowerCase("pt-BR").includes(termo)));
}

async function salvarUnidade() {
    const payload = {
        action: $("unidadeId")?.value ? "editarUnidade" : "cadastrarUnidade",
        id: $("unidadeId") ? $("unidadeId").value : "",
        nome: $("nome") ? $("nome").value : "",
        endereco: $("endereco") ? $("endereco").value : "",
        instalacaoCemig: $("instalacao") ? $("instalacao").value : "",
        observacoes: $("observacoes") ? $("observacoes").value : ""
    };
    if (!payload.nome) { alert("Informe o nome da unidade."); return; }
    await postJSON(payload);
    fecharModal();
    setTimeout(listarUnidades, 1000);
}

async function selecionarUnidade(id) {
    unidadeSelecionada = unidades.find(unidade => Number(unidade.id) === Number(id));
    if (!unidadeSelecionada) return;
    const statusClass = unidadeSelecionada.status === "Inativa" ? "inativa" : "ativa";
    const htmlLojas = await listarLojas(id);
    if ($("detalhesUnidade")) {
        $("detalhesUnidade").innerHTML = `
            <h2>${unidadeSelecionada.nome}</h2>
            <p><strong>Endereco</strong><br>${unidadeSelecionada.endereco || "-"}</p>
            <p><strong>Instalacao Cemig</strong><br>${unidadeSelecionada.instalacaoCemig || "-"}</p>
            <p><strong>Ultima leitura</strong><br>${formatarDataBR(unidadeSelecionada.ultimaLeitura)}</p>
            <p><strong>Proxima leitura</strong><br>${formatarDataBR(unidadeSelecionada.proximaLeitura)}</p>
            <span class="status ${statusClass}">${unidadeSelecionada.status || "Ativa"}</span>
            <hr>
            <h3>Lojas</h3>
            <div class="lista-lojas">${htmlLojas}</div>
            <button class="btn-nova-loja" onclick="abrirModalLoja()">Inserir Loja</button>
            <hr>
            <button class="btn-editar" onclick="editarUnidade()">Editar Unidade</button>
            <button class="btn-desativar" onclick="desativarUnidade()">Desativar Unidade</button>`;
    }
}

async function listarLojas(unidadeId) {
    try {
        lojas = await getJSON("listarLojas", { unidadeId });
        if (!lojas.length) return "<p>Nenhuma loja cadastrada.</p>";
        let html = "";
        lojas.forEach(loja => {
            html += `
                <div class="card-loja" onclick="selecionarLoja(${loja.id})">
                    <h4>${loja.codigoLoja}</h4>
                    <p>Medidor: Vector 4 No: <strong class="numero-medidor">${loja.medidor || "-"}</strong></p>
                </div>`;
        });
        return html;
    } catch (erro) {
        console.error("Erro ao carregar lojas:", erro);
        return "<p>Erro ao carregar lojas.</p>";
    }
}

async function salvarLoja() {
    if (!unidadeSelecionada) { alert("Selecione uma unidade primeiro."); return; }
    const payload = {
        action: "cadastrarLoja",
        unidadeId: unidadeSelecionada.id,
        codigoLoja: $("codigoLoja") ? $("codigoLoja").value : "",
        medidor: $("medidorLoja") ? $("medidorLoja").value : "",
        ordem: $("ordemLoja") ? $("ordemLoja").value : ""
    };
    if (!payload.codigoLoja) { alert("Informe o codigo da loja."); return; }
    await postJSON(payload);
    fecharModalLoja();
    setTimeout(() => selecionarUnidade(unidadeSelecionada.id), 1000);
}

function selecionarLoja(id) {
    lojaSelecionada = lojas.find(loja => Number(loja.id) === Number(id));
    if (!lojaSelecionada) return;
    alert(`${lojaSelecionada.codigoLoja}\n\nMedidor: ${lojaSelecionada.medidor || "-"}\nStatus: ${lojaSelecionada.status || "Ativa"}`);
}

function editarUnidade() {
    if (!unidadeSelecionada) return;
    if ($("tituloModalUnidade")) $("tituloModalUnidade").innerText = "Editar Unidade";
    $("unidadeId").value = unidadeSelecionada.id;
    $("nome").value = unidadeSelecionada.nome || "";
    $("endereco").value = unidadeSelecionada.endereco || "";
    $("instalacao").value = unidadeSelecionada.instalacaoCemig || "";
    $("observacoes").value = unidadeSelecionada.observacoes || "";
    $("modal").style.display = "flex";
}

async function desativarUnidade() {
    if (!unidadeSelecionada || !confirm(`Desativar a unidade ${unidadeSelecionada.nome}? O historico sera preservado.`)) return;
    await postJSON({ action: "desativarUnidade", id: unidadeSelecionada.id, status: "Inativa" });
    setTimeout(async () => { await listarUnidades(); selecionarUnidade(unidadeSelecionada.id); }, 1000);
}

async function listarClientes() {
    try {
        clientes = await getJSON("listarClientes");
        clientes.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
        renderizarClientes(clientes);
    } catch (erro) {
        console.error("Erro ao listar clientes:", erro);
    }
}

function renderizarClientes(lista) {
    let html = "";
    lista.forEach(cliente => {
        html += `
                <div class="card-unidade" onclick="selecionarCliente(${cliente.id})">
                    <h3>${cliente.nome}</h3>
                    <p>${cliente.documento || cliente.cpfCnpj || cliente.cpf || cliente.cnpj || cliente.telefone || "-"}</p>
                </div>`;
    });
    if ($("listaClientes")) $("listaClientes").innerHTML = html || "<p>Nenhum cliente cadastrado.</p>";
}

function filtrarClientes() {
    const termo = ($("pesquisaClientes")?.value || "").trim().toLocaleLowerCase("pt-BR");
    const campos = cliente => [cliente.nome, cliente.documento, cliente.cpfCnpj, cliente.cpf, cliente.cnpj, cliente.telefone, cliente.email]
        .filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    renderizarClientes(clientes.filter(cliente => campos(cliente).includes(termo)));
}

async function salvarCliente() {
    const payload = {
        action: $("clienteId")?.value ? "editarCliente" : "cadastrarCliente",
        id: $("clienteId") ? $("clienteId").value : "",
        nome: $("clienteNome") ? $("clienteNome").value : "",
        documento: $("clienteDocumento") ? $("clienteDocumento").value : "",
        telefone: $("clienteTelefone") ? $("clienteTelefone").value : "",
        email: $("clienteEmail") ? $("clienteEmail").value : "",
        status: $("clienteStatus") ? $("clienteStatus").value : "Ativo",
        observacoes: $("clienteObservacoes") ? $("clienteObservacoes").value : ""
    };
    if (!payload.nome || !payload.documento || !payload.telefone || !payload.email || !payload.status) { alert("Preencha Nome, Documento, Telefone, E-mail e Status."); return; }
    await postJSON(payload);
    fecharModalCliente();
    setTimeout(listarClientes, 1000);
}

function selecionarCliente(id) {
    clienteSelecionado = clientes.find(cliente => Number(cliente.id) === Number(id));
    if (!clienteSelecionado) return;
    const statusClass = ["Arquivado", "Inativo"].includes(clienteSelecionado.status) ? "inativa" : "ativa";
    if ($("detalhesCliente")) {
        $("detalhesCliente").innerHTML = `
            <h2>${clienteSelecionado.nome}</h2>
            <p><strong>CPF/CNPJ</strong><br>${clienteSelecionado.documento || clienteSelecionado.cpfCnpj || clienteSelecionado.cpf || clienteSelecionado.cnpj || "-"}</p>
            <p><strong>Telefone</strong><br>${clienteSelecionado.telefone || "-"}</p>
            <p><strong>E-mail</strong><br>${clienteSelecionado.email || "-"}</p>
            <span class="status ${statusClass}">${clienteSelecionado.status || "Ativo"}</span>
            <hr>
            <p><strong>Observacoes</strong></p>
            <p>${clienteSelecionado.observacoes || "-"}</p>
            <button class="btn-editar" onclick="editarCliente()">Editar Cliente</button>
            <button class="btn-desativar" onclick="desativarCliente()">Desativar Cliente</button>`;
    }
}

function editarCliente() {
    if (!clienteSelecionado) return;
    if ($("tituloModalCliente")) $("tituloModalCliente").innerText = "Editar Cliente";
    $("clienteId").value = clienteSelecionado.id;
    $("clienteNome").value = clienteSelecionado.nome || "";
    $("clienteDocumento").value = clienteSelecionado.documento || clienteSelecionado.cpfCnpj || clienteSelecionado.cpf || clienteSelecionado.cnpj || "";
    $("clienteTelefone").value = clienteSelecionado.telefone || "";
    $("clienteEmail").value = clienteSelecionado.email || "";
    if ($("clienteStatus")) $("clienteStatus").value = clienteSelecionado.status || "Ativo";
    $("clienteObservacoes").value = clienteSelecionado.observacoes || "";
    $("modalCliente").style.display = "flex";
}

async function desativarCliente() {
    if (!clienteSelecionado || !confirm(`Desativar o cliente ${clienteSelecionado.nome}? O historico sera preservado.`)) return;
    await postJSON({ action: "desativarCliente", id: clienteSelecionado.id, status: "Inativo" });
    setTimeout(async () => { await listarClientes(); selecionarCliente(clienteSelecionado.id); }, 1000);
}

async function listarOcupacoes() {
    try {
        [ocupacoesBrutas, unidades] = await Promise.all([getJSON("listarOcupacoes"), getJSON("listarUnidades")]);
        renderizarUnidadesOcupacoes(unidades);
        if (unidadeOcupacoesSelecionada) selecionarUnidadeOcupacoes(unidadeOcupacoesSelecionada.id);
    } catch (erro) {
        console.error("Erro ao listar ocupacoes:", erro);
    }
}

function renderizarUnidadesOcupacoes(lista) {
    const html = lista
        .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"))
        .map(unidade => `<div class="card-unidade" data-pesquisa="${unidade.nome || ""} ${unidade.endereco || ""}" onclick="selecionarUnidadeOcupacoes(${unidade.id})"><h3>${unidade.nome}</h3><p>${unidade.endereco || "-"}</p></div>`)
        .join("");
    if ($("listaUnidadesOcupacoes")) $("listaUnidadesOcupacoes").innerHTML = html || "<p>Nenhuma unidade cadastrada.</p>";
}

function filtrarUnidadesOcupacoes() {
    const termo = ($("pesquisaUnidadesOcupacoes")?.value || "").trim().toLocaleLowerCase("pt-BR");
    renderizarUnidadesOcupacoes(unidades.filter(u => `${u.nome || ""} ${u.endereco || ""}`.toLocaleLowerCase("pt-BR").includes(termo)));
}

function selecionarUnidadeOcupacoes(id) {
    unidadeOcupacoesSelecionada = unidades.find(u => mesmoId(u.id, id));
    filtroStatusOcupacoes = filtroStatusOcupacoes || "Ativa";
    renderizarOcupacoesDaUnidade();
}

function alterarFiltroOcupacoes(status) {
    filtroStatusOcupacoes = status;
    renderizarOcupacoesDaUnidade();
}

function renderizarOcupacoesDaUnidade() {
    if (!unidadeOcupacoesSelecionada || !$("detalhesOcupacao")) return;
    const lista = ocupacoesBrutas
        .filter(o => mesmoId(o.unidadeId, unidadeOcupacoesSelecionada.id))
        .filter(o => filtroStatusOcupacoes === "Todas" || String(o.status || "Ativa") === filtroStatusOcupacoes)
        .sort((a, b) => compararLojas(a.lojaCodigo, b.lojaCodigo));
    const linhas = lista.map(o => `
        <tr class="linha-clicavel" onclick="selecionarOcupacao(${o.id})">
            <td>${o.lojaCodigo || "-"}</td><td>${o.clienteNome || "-"}</td>
            <td>${formatarDataBR(o.dataInicio)}</td><td>${formatarDataBR(o.dataFim)}</td>
            <td><span class="status ${o.status === "Encerrada" ? "inativa" : "ativa"}">${o.status || "Ativa"}</span></td>
        </tr>`).join("");
    $("detalhesOcupacao").innerHTML = `
        <div class="cabecalho-detalhes"><div><h2>${unidadeOcupacoesSelecionada.nome}</h2><p>Ocupacoes ordenadas por loja.</p></div></div>
        <div class="filtro-status" role="group" aria-label="Filtrar ocupacoes">
            ${["Ativa", "Encerrada", "Todas"].map(status => `<button class="btn-filtro ${filtroStatusOcupacoes === status ? "ativo" : ""}" onclick="alterarFiltroOcupacoes('${status}')">${status === "Ativa" ? "Ativas" : status === "Encerrada" ? "Encerradas" : "Todas"}</button>`).join("")}
        </div>
        <div class="tabela-scroll"><table><thead><tr><th>Loja</th><th>Cliente</th><th>Inicio</th><th>Fim</th><th>Status</th></tr></thead>
        <tbody>${linhas || '<tr><td colspan="5">Nenhuma ocupacao encontrada.</td></tr>'}</tbody></table></div>
        <div id="detalheOcupacaoSelecionada" class="detalhe-expandido"></div>`;
}

function selecionarOcupacao(id) {
    const o = ocupacoesBrutas.find(item => mesmoId(item.id, id));
    if (!o || !$("detalheOcupacaoSelecionada")) return;
    $("detalheOcupacaoSelecionada").innerHTML = `
        <h3>Detalhes da ocupacao</h3>
        <div class="grid-detalhes"><p><strong>Cliente</strong><br>${o.clienteNome || "-"}</p><p><strong>Unidade</strong><br>${o.unidadeNome || unidadeOcupacoesSelecionada.nome}</p><p><strong>Loja</strong><br>${o.lojaCodigo || "-"}</p><p><strong>Inicio</strong><br>${formatarDataBR(o.dataInicio)}</p><p><strong>Encerramento</strong><br>${formatarDataBR(o.dataFim)}</p><p><strong>Status</strong><br>${o.status || "Ativa"}</p></div>
        ${o.status === "Ativa" ? `<button class="btn-desativar" onclick="abrirModalEncerramentoIndividual(${o.id})">Encerrar Contrato</button>` : ""}`;
}

async function carregarSelectsModalOcupacao() {
    const listaCli = await getJSON("listarClientes");
    const listaUni = await getJSON("listarUnidades");
    const clientesAtivos = listaCli.filter(c => !["Inativo", "Arquivado"].includes(c.status));
    if ($("ocupacaoCliente")) $("ocupacaoCliente").innerHTML = '<option value="">Selecione um Cliente...</option>' + clientesAtivos.map(c => `<option value="${c.id}">${c.nome}</option>`).join("");
    if ($("ocupacaoUnidade")) $("ocupacaoUnidade").innerHTML = '<option value="">Selecione uma Unidade...</option>' + listaUni.map(u => `<option value="${u.id}">${u.nome}</option>`).join("");
    if ($("containerCheckboxesLojas")) $("containerCheckboxesLojas").innerHTML = "<span class='texto-ajuda'>Selecione uma unidade primeiro.</span>";
}

async function atualizarSelectLojas() {
    const unidadeId = $("ocupacaoUnidade") ? $("ocupacaoUnidade").value : "";
    const container = $("containerCheckboxesLojas");
    if ($("containerLeiturasIniciais")) $("containerLeiturasIniciais").innerHTML = "";
    if (!unidadeId || !container) {
        if (container) container.innerHTML = "<span class='texto-ajuda'>Selecione uma unidade primeiro.</span>";
        return;
    }
    const listaLoj = await getJSON("listarLojas", { unidadeId });
    lojas = listaLoj;
    let html = "";
    listaLoj.forEach(l => {
        const ocupada = ocupacoesBrutas.some(o => Number(o.lojaId) === Number(l.id) && o.status === "Ativa");
        if (!ocupada) {
            html += `
                <label class="linha-check">
                    <input type="checkbox" id="chk_loja_${l.id}" value="${l.id}" data-codigo="${l.codigoLoja}" onchange="renderizarCamposLeiturasEntrada()">
                    <span>${l.codigoLoja} (Medidor: ${l.medidor || "-"})</span>
                </label>`;
        }
    });
    container.innerHTML = html || "<span class='texto-alerta'>Nenhuma loja disponivel nesta unidade.</span>";
}

function renderizarCamposLeiturasEntrada() {
    const container = $("containerLeiturasIniciais");
    const checkboxes = document.querySelectorAll("#containerCheckboxesLojas input[type='checkbox']:checked");
    if (!container) return;
    container.innerHTML = Array.from(checkboxes).map(chk => {
        const idLoja = chk.value;
        const codigoLoja = chk.getAttribute("data-codigo");
        const lojaDados = lojas.find(l => Number(l.id) === Number(idLoja));
        return `
            <div class="bloco-leitura">
                <label>Leitura Inicial - ${codigoLoja} (Medidor: ${lojaDados ? lojaDados.medidor || "-" : "-"})</label>
                <input type="number" id="leitura_inicial_loja_${idLoja}" placeholder="Digite a leitura atual" min="0" step="0.01" required>
            </div>`;
    }).join("");
}

function selecionarOcupacaoAgrupada(index) {
    ocupacaoSelecionada = ocupacoesAgrupadas[index];
    if (!ocupacaoSelecionada) return;
    const statusClass = ocupacaoSelecionada.status === "Encerrada" ? "inativa" : "ativa";
    let htmlLojasDetalhes = "";
    ocupacaoSelecionada.lojasVinculadas.forEach(l => {
        const stLojaClass = l.statusIndividual === "Encerrada" ? "inativa" : "ativa";
        htmlLojasDetalhes += `
            <div class="mini-card">
                <div class="mini-card-topo">
                    <h4>${l.lojaCodigo}</h4>
                    <span class="status ${stLojaClass}">${l.statusIndividual}</span>
                </div>
                <p><strong>Leitura Inicial:</strong> ${numero(l.leituraInicial, 2)} kWh</p>
                <p><strong>Data Fim:</strong> ${l.dataFim || "-"}</p>
                <p><strong>Leitura Final:</strong> ${l.leituraFinal ? numero(l.leituraFinal, 2) + " kWh" : "-"}</p>
                ${l.statusIndividual === "Ativa" ? `<button class="btn-desativar btn-pequeno" onclick="abrirModalEncerramentoIndividual(${l.idLinhaBanco})">Encerrar Loja</button>` : ""}
            </div>`;
    });
    if ($("detalhesOcupacao")) {
        $("detalhesOcupacao").innerHTML = `
            <h2>Detalhes da Ocupacao</h2>
            <p><strong>Cliente:</strong> ${ocupacaoSelecionada.clienteNome}</p>
            <p><strong>Unidade:</strong> ${ocupacaoSelecionada.unidadeNome}</p>
            <p><strong>Data de Entrada:</strong> ${ocupacaoSelecionada.dataInicio}</p>
            <span class="status ${statusClass}">Contrato ${ocupacaoSelecionada.status}</span>
            <hr>
            <h3>Medidores e lojas associadas</h3>
            ${htmlLojasDetalhes}`;
    }
}

async function abrirModalEncerramentoIndividual(idLinhaBanco) {
    const ocpBruta = ocupacoesBrutas.find(o => Number(o.id) === Number(idLinhaBanco));
    if (!ocpBruta) return;
    if ($("tituloModalOcupacao")) $("tituloModalOcupacao").innerText = "Encerrar Ocupacao de Loja";
    if ($("ocupacaoId")) $("ocupacaoId").value = ocpBruta.id;
    if ($("ocupacaoCliente")) $("ocupacaoCliente").innerHTML = `<option value="${ocpBruta.clienteId}">${ocpBruta.clienteNome}</option>`;
    if ($("ocupacaoUnidade")) $("ocupacaoUnidade").innerHTML = `<option value="${ocpBruta.unidadeId}">${ocpBruta.unidadeNome}</option>`;
    if ($("containerCheckboxesLojas")) $("containerCheckboxesLojas").innerHTML = `<label class="linha-check"><input type="checkbox" checked disabled><span>${ocpBruta.lojaCodigo}</span></label>`;
    if ($("ocupacaoDataInicio")) $("ocupacaoDataInicio").value = ocpBruta.dataInicio;
    if ($("containerLeiturasIniciais")) $("containerLeiturasIniciais").innerHTML = `<div class="bloco-leitura neutro">Entrada em ${ocpBruta.dataInicio}<br>Leitura de entrada: ${numero(ocpBruta.leituraInicial, 2)} kWh</div>`;
    if ($("containerLeiturasFinais")) $("containerLeiturasFinais").innerHTML = `
        <div class="bloco-leitura alerta">
            <label>Leitura Final - ${ocpBruta.lojaCodigo}</label>
            <input type="number" id="leitura_final_loja_${ocpBruta.lojaId}" placeholder="Digite o valor no ato da saida" min="0" step="0.01" required>
        </div>`;
    if ($("blocoEncerramentoOcupacao")) $("blocoEncerramentoOcupacao").style.display = "block";
    if ($("modalOcupacao")) $("modalOcupacao").style.display = "flex";
}

async function salvarOcupacao() {
    const id = $("ocupacaoId") ? $("ocupacaoId").value : "";
    const clienteId = $("ocupacaoCliente") ? $("ocupacaoCliente").value : "";
    const unidadeId = $("ocupacaoUnidade") ? $("ocupacaoUnidade").value : "";
    const dataInicio = $("ocupacaoDataInicio") ? $("ocupacaoDataInicio").value : "";
    const dataFim = $("ocupacaoDataFim") ? $("ocupacaoDataFim").value : "";

    if (id) {
        const ocpBruta = ocupacoesBrutas.find(o => Number(o.id) === Number(id));
        const leituraFinal = $(`leitura_final_loja_${ocpBruta.lojaId}`) ? $(`leitura_final_loja_${ocpBruta.lojaId}`).value : "";
        if (!dataFim || !leituraFinal) { alert("Informe a data de fim e a leitura final."); return; }
        await postJSON({ action: "encerrarOcupacao", id, dataFim, leituraFinal });
        fecharModalOcupacao();
        setTimeout(listarOcupacoes, 1000);
        return;
    }

    const lojasSelecionadas = Array.from(document.querySelectorAll("#containerCheckboxesLojas input[type='checkbox']:checked")).map(chk => chk.value);
    if (!clienteId || !unidadeId || !dataInicio || lojasSelecionadas.length === 0) {
        alert("Preencha todos os campos obrigatorios e marque ao menos uma loja.");
        return;
    }
    for (const lojaId of lojasSelecionadas) {
        if (!$(`leitura_inicial_loja_${lojaId}`) || !$(`leitura_inicial_loja_${lojaId}`).value) {
            alert("Preencha a Leitura Inicial de todas as lojas selecionadas.");
            return;
        }
    }
    for (const lojaId of lojasSelecionadas) {
        await postJSON({
            action: "cadastrarOcupacao",
            clienteId,
            unidadeId,
            lojaId,
            dataInicio,
            leituraInicial: $(`leitura_inicial_loja_${lojaId}`).value
        });
    }
    fecharModalOcupacao();
    setTimeout(listarOcupacoes, 1000);
}

function renderizarListaUnidadesModulo(containerId, callbackName) {
    let html = "";
    unidades.forEach(unidade => {
        html += `
            <div class="card-unidade" data-pesquisa="${unidade.nome || ""} ${unidade.endereco || ""}" onclick="${callbackName}(${unidade.id})">
                <h3>${unidade.nome}</h3>
                <p>${unidade.endereco || "-"}</p>
            </div>`;
    });
    if ($(containerId)) $(containerId).innerHTML = html || "<p>Nenhuma unidade cadastrada.</p>";
}

function filtrarListaModulo(containerId, valor) {
    const termo = String(valor || "").trim().toLocaleLowerCase("pt-BR");
    document.querySelectorAll(`#${containerId} .card-unidade`).forEach(card => {
        card.style.display = (card.dataset.pesquisa || "").toLocaleLowerCase("pt-BR").includes(termo) ? "block" : "none";
    });
}

async function listarUnidadesLeituras() {
    unidades = await getJSON("listarUnidades");
    renderizarListaUnidadesModulo("listaUnidadesLeituras", "selecionarUnidadeLeituras");
}

async function selecionarUnidadeLeituras(id) {
    unidadeLeiturasSelecionada = unidades.find(u => Number(u.id) === Number(id));
    if (!unidadeLeiturasSelecionada) return;
    const [leituras, faturas, rateios, lojasDaUnidade, ocupacoesDaUnidade] = await Promise.all([
        getJSON("listarLeituras", { unidadeId: id }),
        getJSON("listarFaturas", { unidadeId: id }),
        getJSON("listarRateios", { unidadeId: id }),
        getJSON("listarLojas", { unidadeId: id }),
        getJSON("listarOcupacoes")
    ]);
    const mapaLojasLeitura = new Map(lojasDaUnidade.map(loja => [String(loja.id), loja]));
    leituras.forEach(leitura => {
        const loja = mapaLojasLeitura.get(String(leitura.lojaId));
        if (!leitura.lojaCodigo) leitura.lojaCodigo = loja?.codigoLoja || `ID: ${leitura.lojaId}`;
        if (!leitura.medidor) leitura.medidor = loja?.medidor || "-";
        const ocupacao = ocupacaoDaLojaNaData(ocupacoesDaUnidade, leitura.lojaId, leitura.dataLeituraAtual);
        if (!leitura.clienteNome && !leitura.clienteAtual) {
            leitura.clienteNome = ocupacao?.clienteNome || clienteDaLojaNaData(ocupacoesDaUnidade, leitura.lojaId, leitura.dataLeituraAtual);
        }
        const semAnterior = !leitura.dataLeituraAnterior && Number(leitura.leituraAnterior || 0) === 0;
        if (semAnterior && ocupacao && Number(ocupacao.leituraInicial || 0) > 0) {
            leitura.dataLeituraAnterior = ocupacao.dataInicio || leitura.dataLeituraAnterior;
            leitura.leituraAnterior = Number(ocupacao.leituraInicial || 0);
            leitura.consumo = Number(leitura.leituraAtual || 0) - Number(leitura.leituraAnterior || 0);
        }
    });
    const grupos = {};
    leituras.forEach(leitura => {
        const competencia = normalizarCompetencia(leitura.competencia);
        if (!grupos[competencia]) grupos[competencia] = [];
        grupos[competencia].push(leitura);
    });
    const competencias = Object.keys(grupos).sort((a, b) => {
        const [ma, aa] = a.split("/").map(Number);
        const [mb, ab] = b.split("/").map(Number);
        return ab - aa || mb - ma;
    });
    let html = `
        <div class="cabecalho-detalhes">
            <div>
                <h2>${unidadeLeiturasSelecionada.nome}</h2>
                <p>Historico de leituras da unidade.</p>
            </div>
            <button class="btn-nova" onclick="abrirModalLeitura()">Adicionar Leitura</button>
        </div>
        <div class="tabela-scroll">
            <table>
                <thead>
                    <tr>
                        <th>Competencia</th><th>Data Leitura</th><th>Lojas</th><th>Consumo Total</th><th>Status</th>
                    </tr>
                </thead>
                <tbody>`;
    competencias.forEach((competencia, indice) => {
        const itens = grupos[competencia].sort((a, b) => compararLojas(a.lojaCodigo, b.lojaCodigo));
        const temFatura = faturas.some(f => normalizarCompetencia(f.competencia) === competencia);
        const temRateio = rateios.some(r => normalizarCompetencia(r.competencia) === competencia);
        const status = !itens.length ? "Leitura Pendente" : !temFatura ? "Fatura Pendente" : !temRateio ? "Rateio Pendente" : "Concluido";
        const total = itens.reduce((soma, item) => soma + Number(item.consumo ?? (Number(item.leituraAtual) - Number(item.leituraAnterior)) ?? 0), 0);
        html += `<tr class="linha-clicavel" onclick="alternarDetalhe('detalhe-leitura-${indice}')"><td>${formatarCompetenciaExtenso(competencia)}</td><td>${formatarDataBR(itens[0]?.dataLeituraAtual)}</td><td>${itens.length}</td><td>${numero(total, 2)} kWh</td><td><span class="status ${status === "Concluido" ? "ativa" : "pendente"}">${status}</span></td></tr>`;
        html += `<tr id="detalhe-leitura-${indice}" class="linha-detalhe"><td colspan="5"><div class="tabela-scroll"><table><thead><tr><th>Loja</th><th>Cliente</th><th>Medidor</th><th>Leituras</th><th>Consumo</th><th>Acoes</th></tr></thead><tbody>${itens.map(item => `<tr><td>${item.lojaCodigo || "-"}</td><td>${item.clienteNome || item.clienteAtual || "-"}</td><td><strong class="numero-medidor">${item.medidor || "-"}</strong></td><td>${numero(item.leituraAnterior, 2)} &rarr; ${numero(item.leituraAtual, 2)}</td><td>${numero(item.consumo ?? Number(item.leituraAtual) - Number(item.leituraAnterior), 2)} kWh</td><td><button class="btn-editar btn-pequeno sem-margem" onclick="editarLeitura(${item.id})">Editar</button><button class="btn-desativar btn-pequeno sem-margem" onclick="excluirLeitura(${item.id})">Excluir</button></td></tr>`).join("")}</tbody></table></div></td></tr>`;
    });
    html += competencias.length ? "</tbody></table></div>" : `<tr><td colspan="5">Nenhuma leitura cadastrada.</td></tr></tbody></table></div>`;
    if ($("detalhesLeituras")) $("detalhesLeituras").innerHTML = html;
}

async function abrirModalLeitura() {
    if (!unidadeLeiturasSelecionada) { alert("Selecione uma unidade primeiro."); return; }
    const [itensPreparados, lojasDaUnidade] = await Promise.all([
        getJSON("prepararNovaLeitura", { unidadeId: unidadeLeiturasSelecionada.id }),
        getJSON("listarLojas", { unidadeId: unidadeLeiturasSelecionada.id })
    ]);
    const mapaLojas = new Map(lojasDaUnidade.map(loja => [String(loja.id), loja]));
    itensNovaLeitura = itensPreparados.map(item => ({
        ...item,
        medidor: item.medidor || mapaLojas.get(String(item.lojaId))?.medidor || "-"
    }));
    if (!itensNovaLeitura.length) { alert("Nao ha lojas ativas nesta unidade."); return; }
    if ($("leituraCompetencia")) $("leituraCompetencia").value = "";
    if ($("leituraDataAtual")) $("leituraDataAtual").value = hojeISO();
    renderizarTabelaNovaLeitura();
    if ($("modalLeitura")) $("modalLeitura").style.display = "flex";
}

function fecharModalLeitura() {
    if ($("modalLeitura")) $("modalLeitura").style.display = "none";
    itensNovaLeitura = [];
}

function renderizarTabelaNovaLeitura() {
    let html = "";
    itensNovaLeitura.forEach(item => {
        html += `
            <tr>
                <td>${item.lojaCodigo}</td>
                <td>${item.clienteAtual}</td>
                <td><strong class="numero-medidor">${item.medidor || item.numeroMedidor || "-"}</strong></td>
                <td>${numero(item.leituraAnterior, 2)}<br><small>${item.dataLeituraAnterior || "-"}</small></td>
                <td><input type="number" id="leitura_atual_${item.lojaId}" step="0.01" placeholder="Leitura atual" oninput="atualizarConsumoLeitura(${item.lojaId}, ${Number(item.leituraAnterior) || 0})"></td>
                <td id="consumo_leitura_${item.lojaId}">0,00 kWh</td>
            </tr>`;
    });
    if ($("corpoTabelaNovaLeitura")) $("corpoTabelaNovaLeitura").innerHTML = html;
}

function atualizarConsumoLeitura(lojaId, anterior) {
    const atual = Number($(`leitura_atual_${lojaId}`)?.value);
    const consumo = Number.isFinite(atual) ? atual - Number(anterior || 0) : 0;
    if ($(`consumo_leitura_${lojaId}`)) $(`consumo_leitura_${lojaId}`).innerText = `${numero(consumo, 2)} kWh`;
}

function alternarDetalhe(id) {
    const linha = $(id);
    if (linha) linha.classList.toggle("aberta");
}

async function salvarLeitura() {
    if (!unidadeLeiturasSelecionada) return;
    const competencia = normalizarCompetencia($("leituraCompetencia") ? $("leituraCompetencia").value : "");
    const dataLeituraAtual = $("leituraDataAtual") ? $("leituraDataAtual").value : "";
    if (!competencia || !dataLeituraAtual) { alert("Informe competencia e data da leitura."); return; }
    const existentes = await getJSON("listarLeituras", { unidadeId: unidadeLeiturasSelecionada.id });
    if (existentes.some(l => normalizarCompetencia(l.competencia) === competencia)) {
        alert("Esta competencia ja foi lancada para esta unidade.");
        return;
    }
    const itens = [];
    for (const item of itensNovaLeitura) {
        const campo = $(`leitura_atual_${item.lojaId}`);
        const atual = campo ? Number(campo.value) : NaN;
        if (isNaN(atual)) {
            alert(`Informe uma leitura valida para a loja ${item.lojaCodigo}.`);
            return;
        }
        const confirmadaMenor = atual < Number(item.leituraAnterior);
        if (confirmadaMenor && !confirm(`A leitura atual da loja ${item.lojaCodigo} e menor que a anterior. Deseja continuar?`)) return;
        itens.push({
            lojaId: item.lojaId,
            dataLeituraAnterior: item.dataLeituraAnterior,
            leituraAnterior: item.leituraAnterior,
            leituraAtual: atual,
            confirmadaMenor
        });
    }
    await postJSON({ action: "cadastrarLeitura", unidadeId: unidadeLeiturasSelecionada.id, competencia, dataLeituraAtual, itens });
    fecharModalLeitura();
    setTimeout(() => selecionarUnidadeLeituras(unidadeLeiturasSelecionada.id), 1000);
}

async function editarLeitura(id) {
    const leituras = await getJSON("listarLeituras", { unidadeId: unidadeLeiturasSelecionada.id });
    const leitura = leituras.find(item => mesmoId(item.id, id));
    if (!leitura) return;
    const valor = prompt("Informe a nova leitura atual:", leitura.leituraAtual);
    if (valor === null) return;
    const leituraAtual = Number(String(valor).replace(",", "."));
    if (!Number.isFinite(leituraAtual)) {
        alert("Informe uma leitura valida.");
        return;
    }
    await postJSON({ action: "editarLeitura", id, leituraAtual, leituraAnterior: leitura.leituraAnterior });
    selecionarUnidadeLeituras(unidadeLeiturasSelecionada.id);
}

async function excluirLeitura(id) {
    if (!confirm("Excluir esta leitura? Esta acao remove o registro do banco.")) return;
    await postJSON({ action: "excluirLeitura", id });
    selecionarUnidadeLeituras(unidadeLeiturasSelecionada.id);
}

function formatarCompetencia(valor) {
    return normalizarCompetencia(valor) || "-";
}

async function listarUnidadesFaturas() {
    unidades = await getJSON("listarUnidades");
    renderizarListaUnidadesModulo("listaUnidadesFaturas", "selecionarUnidadeFaturas");
}

async function selecionarUnidadeFaturas(id) {
    unidadeFaturasSelecionada = unidades.find(u => Number(u.id) === Number(id));
    if (!unidadeFaturasSelecionada) return;
    faturasUnidade = await getJSON("listarFaturas", { unidadeId: id });
    let html = `
        <div class="cabecalho-detalhes">
            <div>
                <h2>${unidadeFaturasSelecionada.nome}</h2>
                <p>Historico de faturas da unidade.</p>
            </div>
            <button class="btn-nova" onclick="abrirModalFatura()">Adicionar Fatura</button>
        </div>
	`;	
     
		html += `
		<div class="tabela-scroll">
		<table>
		<thead>
		<tr>
   			<th>Competência</th>
    		<th>Consumo</th>
    		<th>Valor kWh</th>
    		<th>Valor Conta</th>
    		<th>Leitura</th>
    		<th>Vencimento</th>
    		<th>Acoes</th>
		</tr>
		</thead>
		<tbody>
	`;	
    
	
	faturasUnidade.forEach(f => {
        html += `
<tr class="linha-clicavel" onclick="visualizarFatura(${f.id})">
                <td>${formatarCompetencia(f.competencia)}</td>
            	<td>${numero(f.consumoTotal, 2)} kWh</td>
				<td>${moeda(f.valorKwh)}</td>
				<td>${moeda(f.valorConta)}</td>
				<td>${formatarDataBR(f.dataLeituraAtual)}</td>
				<td>${formatarDataBR(f.dataVencimento)}</td>
				<td><button class="btn-editar btn-pequeno sem-margem" onclick="event.stopPropagation(); editarFatura(${f.id})">Editar</button><button class="btn-desativar btn-pequeno sem-margem" onclick="event.stopPropagation(); excluirFatura(${f.id})">Excluir</button></td>
			</tr>
	`;			
    });

if (faturasUnidade.length) {
    html += `
    </tbody>
    </table>
</div>
    `;
} else {
    html += `
    <tr>
        <td colspan="7">Nenhuma fatura cadastrada.</td>
    </tr>
    </tbody>
    </table>
</div>
    `;
}

function visualizarFatura(id) {
    const fatura = faturasUnidade.find(item => mesmoId(item.id, id));
    if (!fatura) return;
    const existente = $("detalheFaturaSelecionada");
    if (existente) existente.remove();
    const painel = document.createElement("div");
    painel.id = "detalheFaturaSelecionada";
    painel.className = "detalhe-expandido";
    painel.innerHTML = `<h3>Fatura ${formatarCompetencia(fatura.competencia)}</h3><div class="grid-detalhes"><p><strong>Consumo total</strong><br>${numero(fatura.consumoTotal, 2)} kWh</p><p><strong>Valor kWh</strong><br>${moeda(fatura.valorKwh)}</p><p><strong>Valor da conta</strong><br>${moeda(fatura.valorConta)}</p><p><strong>Leitura atual</strong><br>${formatarDataBR(fatura.dataLeituraAtual)}</p><p><strong>Proxima leitura</strong><br>${formatarDataBR(fatura.dataProximaLeitura)}</p><p><strong>Vencimento</strong><br>${formatarDataBR(fatura.dataVencimento)}</p></div>`;
    $("detalhesFaturas").appendChild(painel);
}
    if ($("detalhesFaturas")) $("detalhesFaturas").innerHTML = html;
}

function abrirModalFatura() {
    if (!unidadeFaturasSelecionada) {
        alert("Selecione uma unidade primeiro.");
        return;
    }

    [
        "faturaId",
        "faturaCompetencia",
        "faturaValorConta",
        "faturaConsumoTotal",
        "faturaDataLeituraAtual",
        "faturaDataProximaLeitura",
        "faturaDataVencimento"
    ].forEach(id => {
        if ($(id)) $(id).value = "";
    });
    if ($("tituloModalFatura")) $("tituloModalFatura").innerText = "Nova Fatura";

    if ($("modalFatura")) {
        $("modalFatura").style.display = "flex";
    }
}

function fecharModalFatura() {
    if ($("modalFatura")) $("modalFatura").style.display = "none";
}

async function salvarFatura() {
    if (!unidadeFaturasSelecionada) return;
    const id = $("faturaId") ? $("faturaId").value : "";
    const competencia = normalizarCompetencia($("faturaCompetencia") ? $("faturaCompetencia").value : "");
    if (!id && faturasUnidade.some(f => normalizarCompetencia(f.competencia) === competencia)) {
        alert("Esta competencia ja possui fatura para a unidade.");
        return;
    }
    const payload = {
        action: id ? "editarFatura" : "cadastrarFatura",
        id,
        unidadeId: unidadeFaturasSelecionada.id,
        competencia,
        valorConta: $("faturaValorConta") ? $("faturaValorConta").value : "",
        consumoTotal: $("faturaConsumoTotal") ? $("faturaConsumoTotal").value : "",
        dataLeituraAtual: $("faturaDataLeituraAtual") ? $("faturaDataLeituraAtual").value : "",
        dataProximaLeitura: $("faturaDataProximaLeitura") ? $("faturaDataProximaLeitura").value : "",
        dataVencimento: $("faturaDataVencimento") ? $("faturaDataVencimento").value : ""
    };
    if (!payload.competencia || !payload.valorConta || !payload.consumoTotal || !payload.dataLeituraAtual || !payload.dataProximaLeitura || !payload.dataVencimento) {
        alert("Preencha todos os campos da fatura.");
        return;
    }
    await postJSON(payload);
    fecharModalFatura();
    setTimeout(() => selecionarUnidadeFaturas(unidadeFaturasSelecionada.id), 1000);
}

function visualizarFatura(id) {
    const fatura = faturasUnidade.find(item => mesmoId(item.id, id));
    if (!fatura) return;
    const existente = $("detalheFaturaSelecionada");
    if (existente) existente.remove();
    const painel = document.createElement("div");
    painel.id = "detalheFaturaSelecionada";
    painel.className = "detalhe-expandido";
    painel.innerHTML = `<h3>Fatura ${formatarCompetencia(fatura.competencia)}</h3><div class="grid-detalhes"><p><strong>Consumo total</strong><br>${numero(fatura.consumoTotal, 2)} kWh</p><p><strong>Valor kWh</strong><br>${moeda(fatura.valorKwh)}</p><p><strong>Valor da conta</strong><br>${moeda(fatura.valorConta)}</p><p><strong>Leitura atual</strong><br>${formatarDataBR(fatura.dataLeituraAtual)}</p><p><strong>Proxima leitura</strong><br>${formatarDataBR(fatura.dataProximaLeitura)}</p><p><strong>Vencimento</strong><br>${formatarDataBR(fatura.dataVencimento)}</p></div>`;
    $("detalhesFaturas").appendChild(painel);
}

function editarFatura(id) {
    const fatura = faturasUnidade.find(item => mesmoId(item.id, id));
    if (!fatura) return;
    if ($("tituloModalFatura")) $("tituloModalFatura").innerText = "Editar Fatura";
    if ($("faturaId")) $("faturaId").value = fatura.id;
    if ($("faturaCompetencia")) {
        const competencia = normalizarCompetencia(fatura.competencia);
        const partes = competencia.match(/^(\d{2})\/(\d{4})$/);
        $("faturaCompetencia").value = partes ? `${partes[2]}-${partes[1]}` : "";
    }
    if ($("faturaValorConta")) $("faturaValorConta").value = fatura.valorConta || "";
    if ($("faturaConsumoTotal")) $("faturaConsumoTotal").value = fatura.consumoTotal || "";
    if ($("faturaDataLeituraAtual")) $("faturaDataLeituraAtual").value = String(fatura.dataLeituraAtual || "").slice(0, 10);
    if ($("faturaDataProximaLeitura")) $("faturaDataProximaLeitura").value = String(fatura.dataProximaLeitura || "").slice(0, 10);
    if ($("faturaDataVencimento")) $("faturaDataVencimento").value = String(fatura.dataVencimento || "").slice(0, 10);
    if ($("modalFatura")) $("modalFatura").style.display = "flex";
}

async function excluirFatura(id) {
    if (!confirm("Excluir esta fatura? Esta acao remove o registro do banco.")) return;
    await postJSON({ action: "excluirFatura", id });
    selecionarUnidadeFaturas(unidadeFaturasSelecionada.id);
}

async function listarUnidadesRateios() {
    unidades = await getJSON("listarUnidades");
    renderizarListaUnidadesModulo("listaUnidadesRateios", "selecionarUnidadeRateios");
}

async function selecionarUnidadeRateios(id) {
    unidadeRateiosSelecionada = unidades.find(u => Number(u.id) === Number(id));
    if (!unidadeRateiosSelecionada) return;
    rateiosUnidade = await getJSON("listarRateios", { unidadeId: id });
    renderizarRateios();
}

function renderizarRateios() {
    if (!unidadeRateiosSelecionada) return;
    const grupos = {};
    rateiosUnidade.forEach(rateio => {
        const competencia = normalizarCompetencia(rateio.competencia);
        if (!grupos[competencia]) grupos[competencia] = [];
        grupos[competencia].push(rateio);
    });
    let html = `
        <div class="cabecalho-detalhes">
            <div>
                <h2>${unidadeRateiosSelecionada.nome}</h2>
                <p>Historico de rateios da unidade.</p>
            </div>
            <button class="btn-nova" onclick="abrirModalRateio()">Gerar Rateio</button>
        </div>
        <div class="tabela-scroll">
            <table>
                <thead>
                    <tr>
                        <th>Competencia</th><th>Unidade</th><th>Consumo Total</th><th>Valor kWh</th><th>Valor Rateado</th><th>Status</th><th>Acoes</th>
                    </tr>
                </thead>
                <tbody>`;
    Object.keys(grupos).sort().reverse().forEach((competencia, indice) => {
        const itens = grupos[competencia].sort((a, b) => compararLojas(a.lojaCodigo, b.lojaCodigo));
        const consumoTotal = itens.reduce((soma, item) => soma + Number(item.consumo || 0), 0);
        const valorTotal = itens.reduce((soma, item) => soma + Number(item.valorRateado || 0), 0);
        const status = itens.length ? "Concluido" : "Rateio Pendente";
        const itensAgrupados = Object.values(itens.reduce((acc, item) => {
            const chave = String(item.ocupacaoId || item.OcupacaoID || `loja-${item.lojaId}`).trim();
            if (!acc[chave]) {
                acc[chave] = { ...item, lojaCodigo: item.lojaCodigo || "-", consumo: 0, valorRateado: 0 };
            } else {
                acc[chave].lojaCodigo = `${acc[chave].lojaCodigo}, ${item.lojaCodigo || "-"}`;
            }
            acc[chave].consumo += Number(item.consumo || 0);
            acc[chave].valorRateado += Number(item.valorRateado || 0);
            return acc;
        }, {}));
        html += `<tr class="linha-clicavel" onclick="alternarDetalhe('detalhe-rateio-${indice}')"><td>${competencia}</td><td>${unidadeRateiosSelecionada.nome}</td><td>${numero(consumoTotal, 2)} kWh</td><td>${moeda(itens[0]?.valorKwh)}</td><td>${moeda(valorTotal)}</td><td><span class="status ${status === "Concluido" ? "ativa" : "pendente"}">${status}</span></td><td><button class="btn-desativar btn-pequeno sem-margem" onclick="event.stopPropagation(); excluirRateioCompetencia('${competencia}')">Excluir</button></td></tr>`;
        html += `<tr id="detalhe-rateio-${indice}" class="linha-detalhe"><td colspan="7"><div class="tabela-scroll"><table><thead><tr><th>Ocupacao</th><th>Lojas</th><th>Ocupante</th><th>Periodo</th><th>Consumo</th><th>Valor Rateado</th></tr></thead><tbody>${itensAgrupados.map(item => `<tr><td>${item.ocupacaoId || "-"}</td><td>${item.lojaCodigo || "-"}</td><td>${item.clienteNome || "Vaga / area comum"}</td><td>${formatarDataBR(item.periodoInicio)} a ${formatarDataBR(item.periodoFim)}</td><td>${numero(item.consumo, 2)} kWh</td><td>${moeda(item.valorRateado)}</td></tr>`).join("")}</tbody></table></div></td></tr>`;
    });
    html += rateiosUnidade.length ? "</tbody></table></div>" : `<tr><td colspan="7">Nenhum rateio gerado.</td></tr></tbody></table></div>`;
    if ($("detalhesRateios")) $("detalhesRateios").innerHTML = html;
}

function abrirModalRateio() {
    if (!unidadeRateiosSelecionada) { alert("Selecione uma unidade primeiro."); return; }
    if ($("rateioCompetencia")) $("rateioCompetencia").value = "";
    if ($("modalRateio")) $("modalRateio").style.display = "flex";
}

function fecharModalRateio() {
    if ($("modalRateio")) $("modalRateio").style.display = "none";
}

async function gerarRateio() {
    if (!unidadeRateiosSelecionada) return;
    const competencia = normalizarCompetencia($("rateioCompetencia") ? $("rateioCompetencia").value : "");
    if (!competencia) { alert("Informe a competencia do rateio."); return; }
    const faturas = await getJSON("listarFaturas", { unidadeId: unidadeRateiosSelecionada.id });
    const leituras = await getJSON("listarLeituras", { unidadeId: unidadeRateiosSelecionada.id });
    const faturaValida = faturas.some(f => {
        const unidadeIdFatura = f.unidadeId ?? f.UnidadeID ?? f.unidadeID;
        const competenciaFatura = f.competencia ?? f.Competencia;
        return (!unidadeIdFatura || mesmoId(unidadeIdFatura, unidadeRateiosSelecionada.id)) && normalizarCompetencia(competenciaFatura) === competencia;
    });
    if (!faturaValida) {
        alert("Nao e possivel gerar rateio sem fatura da competencia.");
        return;
    }
    if (!leituras.some(l => normalizarCompetencia(l.competencia ?? l.Competencia) === competencia)) {
        alert("Nao e possivel gerar rateio sem leituras da competencia.");
        return;
    }
    await postJSON({ action: "gerarRateio", unidadeId: unidadeRateiosSelecionada.id, competencia });
    fecharModalRateio();
    setTimeout(() => selecionarUnidadeRateios(unidadeRateiosSelecionada.id), 1200);
}

async function excluirRateioCompetencia(competencia) {
    if (!unidadeRateiosSelecionada) return;
    if (!confirm(`Excluir o rateio da competencia ${competencia}? Esta acao remove os registros do banco.`)) return;
    await postJSON({ action: "excluirRateioCompetencia", unidadeId: unidadeRateiosSelecionada.id, competencia });
    selecionarUnidadeRateios(unidadeRateiosSelecionada.id);
}

async function carregarDashboard() {
    try {
        const [dadosDashboard, leituras, faturas, rateios] = await Promise.all([
            getJSON("obterDashboard"),
            getJSON("listarLeituras"),
            getJSON("listarFaturas"),
            getJSON("listarRateios")
        ]);
        dashboardDados = completarStatusDashboard(dadosDashboard, leituras, faturas, rateios);
        renderizarDashboard();
    } catch (erro) {
        console.error("Erro ao carregar dashboard:", erro);
        if ($("dashboardCards")) $("dashboardCards").innerHTML = "<p>Erro ao carregar indicadores.</p>";
    }
}

function cardIndicador(titulo, valor, subtitulo, classe) {
    return `
        <div class="card-indicador ${classe || ""}">
            <span>${titulo}</span>
            <strong>${valor}</strong>
            <small>${subtitulo || ""}</small>
        </div>`;
}

function classeStatusLeitura(classe) {
    if (classe === "atrasada") return "status inativa";
    if (classe === "proxima") return "status proxima";
    if (classe === "fatura-pendente") return "status fatura-pendente";
    if (classe === "pendente") return "status pendente";
    if (classe === "em-dia" || classe === "concluido") return "status ativa";
    return "status neutro";
}

function completarStatusDashboard(dados, leituras, faturas, rateios) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    dados.proximasLeituras = (dados.proximasLeituras || []).map(linha => {
        const leiturasUnidade = leituras
            .filter(item => mesmoId(item.unidadeId, linha.unidadeId))
            .sort((a, b) => (dataLocal(b.dataLeituraAtual)?.getTime() || 0) - (dataLocal(a.dataLeituraAtual)?.getTime() || 0));
        const ultimaLeitura = leiturasUnidade[0];
        const proxima = dataLocal(linha.proximaLeitura);
        const proximaFutura = proxima && proxima > hoje;
        const leituraReferencia = proxima && !proximaFutura
            ? leiturasUnidade.find(item => {
                const dataLeitura = dataLocal(item.dataLeituraAtual);
                return dataLeitura && dataLeitura >= proxima;
            })
            : ultimaLeitura;

        if (!leituraReferencia) {
            if (proxima && proxima < hoje) {
                return { ...linha, status: "Leitura Atrasada", classe: "atrasada", ultimaLeitura: ultimaLeitura?.dataLeituraAtual || linha.ultimaLeitura };
            }
            return { ...linha, status: "Leitura Pendente", classe: "proxima", ultimaLeitura: ultimaLeitura?.dataLeituraAtual || linha.ultimaLeitura };
        }

        if (!ultimaLeitura) return { ...linha, status: "Leitura Pendente", classe: "proxima" };

        const competencia = normalizarCompetencia(leituraReferencia.competencia);
        const temFatura = faturas.some(item => mesmoId(item.unidadeId, linha.unidadeId) && normalizarCompetencia(item.competencia) === competencia);
        if (!temFatura) return { ...linha, status: "Fatura Pendente", classe: "fatura-pendente", ultimaLeitura: leituraReferencia.dataLeituraAtual };

        const temRateio = rateios.some(item => mesmoId(item.unidadeId, linha.unidadeId) && normalizarCompetencia(item.competencia) === competencia);
        if (!temRateio) return { ...linha, status: "Rateio Pendente", classe: "pendente", ultimaLeitura: leituraReferencia.dataLeituraAtual };

        return { ...linha, status: "Concluido", classe: "concluido", ultimaLeitura: leituraReferencia.dataLeituraAtual };
    });
    return dados;
}

function nomeStatusLeitura(linha) {
    const status = String(linha.status || "").toLocaleLowerCase("pt-BR");
    const classe = String(linha.classe || "").toLocaleLowerCase("pt-BR");
    if (status.includes("fatura")) return "Fatura Pendente";
    if (status.includes("rateio")) return "Rateio Pendente";
    if (status.includes("atras") || classe === "atrasada") return "Leitura Atrasada";
    if (status.includes("pend") || status.includes("proxim") || classe === "proxima") return "Leitura Pendente";
    return status.includes("concl") ? "Concluido" : (linha.status || "-");
}

function renderizarDashboard() {
    if (!dashboardDados) return;
    if ($("dashboardCards")) {
        $("dashboardCards").innerHTML = `
            ${cardIndicador("Unidades", numero(dashboardDados.totalUnidades), "Total cadastrado", "azul")}
            ${cardIndicador("Lojas", numero(dashboardDados.totalLojas), "Lojas ativas", "azul")}
            ${cardIndicador("Ocupadas", numero(dashboardDados.lojasOcupadas), "Ocupacoes ativas", "verde")}
            ${cardIndicador("Vagas", numero(dashboardDados.lojasVagas), "Disponiveis para ocupacao", "amarelo")}
            ${cardIndicador("Clientes Ativos", numero(dashboardDados.clientesAtivos), "Nao arquivados", "azul")}
            ${cardIndicador("Consumo Mes", `${numero(dashboardDados.consumoUltimaCompetencia, 2)} kWh`, dashboardDados.ultimaCompetencia || "Sem competencia", "azul")}
            ${cardIndicador("Valor Medio kWh", moeda(dashboardDados.valorMedioKwhUltimaCompetencia), dashboardDados.ultimaCompetencia || "Sem competencia", "verde")}`;
    }
    if ($("dashboardLeituraCards")) {
        $("dashboardLeituraCards").innerHTML = `
            ${cardIndicador("Leituras vencidas", numero(dashboardDados.leiturasVencidas), "Data ultrapassada", "vermelho")}
            ${cardIndicador("Previstas hoje", numero(dashboardDados.leiturasHoje), "ProximaLeitura igual a hoje", "amarelo")}
            ${cardIndicador("Proximas 7 dias", numero(dashboardDados.proximasLeituras7Dias), "Ate 7 dias", "azul")}`;
    }
    if ($("tabelaProximasLeituras")) {
        let html = "";
        dashboardDados.proximasLeituras.forEach(linha => {
            html += `
                <tr>
                    <td>${linha.unidadeNome}</td>
                    <td>${formatarDataBR(linha.ultimaLeitura)}</td>
                    <td>${formatarDataBR(linha.proximaLeitura)}</td>
                    <td><span class="${classeStatusLeitura(linha.classe)}">${nomeStatusLeitura(linha)}</span></td>
                </tr>`;
        });
        $("tabelaProximasLeituras").innerHTML = html || `<tr><td colspan="4">Nenhuma unidade cadastrada.</td></tr>`;
    }
}

async function carregarFiltrosRelatorios() {
    try {
        const [listaUnidades, listaClientes, listaOcupacoes] = await Promise.all([
            getJSON("listarUnidades"),
            getJSON("listarClientes"),
            getJSON("listarOcupacoes")
        ]);
        unidades = listaUnidades;
        clientes = listaClientes;
        ocupacoesBrutas = listaOcupacoes;

        if ($("relatorioUnidade")) {
            $("relatorioUnidade").innerHTML = '<option value="">Todas as unidades</option>' + unidades.map(u => `<option value="${u.id}">${u.nome}</option>`).join("");
        }
        if ($("relatorioCliente")) {
            $("relatorioCliente").innerHTML = '<option value="">Todos os clientes</option>' + clientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join("");
        }
        if ($("relatorioOcupacao")) {
            $("relatorioOcupacao").innerHTML = '<option value="">Selecione uma ocupacao</option>' + ocupacoesBrutas.map(o => `<option value="${o.id}">${o.clienteNome} - ${o.lojaCodigo} (${o.dataInicio})</option>`).join("");
        }
        atualizarFiltrosRelatorio();
    } catch (erro) {
        console.error("Erro ao carregar filtros de relatorios:", erro);
    }
}

function atualizarFiltrosRelatorio() {
    const tipo = $("relatorioTipo") ? $("relatorioTipo").value : "competencia";
    ["grupoFiltroUnidade", "grupoFiltroCliente", "grupoFiltroOcupacao", "grupoFiltroCompetencia"].forEach(id => {
        if ($(id)) $(id).style.display = "none";
    });
    if (tipo === "unidade" && $("grupoFiltroUnidade")) $("grupoFiltroUnidade").style.display = "block";
    if (tipo === "cliente" && $("grupoFiltroCliente")) $("grupoFiltroCliente").style.display = "block";
    if (tipo === "ocupacao" && $("grupoFiltroOcupacao")) $("grupoFiltroOcupacao").style.display = "block";
    if (tipo === "competencia" && $("grupoFiltroCompetencia")) $("grupoFiltroCompetencia").style.display = "block";
    if (tipo !== "ocupacao" && tipo !== "unidade" && $("grupoFiltroUnidade")) $("grupoFiltroUnidade").style.display = tipo === "competencia" ? "block" : "none";
}

function obterFiltrosRelatorio() {
    const tipo = $("relatorioTipo") ? $("relatorioTipo").value : "competencia";
    return {
        tipo,
        unidadeId: $("relatorioUnidade") ? $("relatorioUnidade").value : "",
        clienteId: $("relatorioCliente") ? $("relatorioCliente").value : "",
        ocupacaoId: $("relatorioOcupacao") ? $("relatorioOcupacao").value : "",
        competencia: normalizarCompetencia($("relatorioCompetencia") ? $("relatorioCompetencia").value : "")
    };
}

async function visualizarRelatorio() {
    const filtros = obterFiltrosRelatorio();
    const query = {
        tipo: filtros.tipo,
        unidadeId: filtros.unidadeId,
        clienteId: filtros.clienteId,
        ocupacaoId: filtros.ocupacaoId,
        competencia: filtros.competencia
    };
    relatorioAtual = await getJSON("gerarRelatorio", query);
    renderizarRelatorio(relatorioAtual);
}

function itemResumo(label, valor) {
    return `
        <div class="card-resumo-relatorio">
            <span>${label}</span>
            <strong>${valor}</strong>
        </div>`;
}

function renderizarResumoRelatorio(relatorio) {
    const r = relatorio.resumo || {};
    if (relatorio.tipo === "unidade") {
        return `
            ${itemResumo("Consumo Total", `${numero(r.consumoTotal, 2)} kWh`)}
            ${itemResumo("Valor Total Rateado", moeda(r.valorTotalRateado))}
            ${itemResumo("Quantidade de Lojas", numero(r.quantidadeLojas))}
            ${itemResumo("Lojas Vagas", numero(r.quantidadeLojasVagas))}`;
    }
    if (relatorio.tipo === "cliente") {
        return `
            ${itemResumo("Consumo Total", `${numero(r.consumoTotal, 2)} kWh`)}
            ${itemResumo("Valor Total Pago", moeda(r.valorTotalPago))}
            ${itemResumo("Competencias", (r.historicoCompetencias || []).join(", ") || "-")}`;
    }
    if (relatorio.tipo === "ocupacao") {
        return `
            ${itemResumo("Cliente", r.cliente || "-")}
            ${itemResumo("Loja", r.loja || "-")}
            ${itemResumo("Data Entrada", r.dataEntrada || "-")}
            ${itemResumo("Data Saida", r.dataSaida || "-")}
            ${itemResumo("Consumo Total", `${numero(r.consumoTotal, 2)} kWh`)}
            ${itemResumo("Valor Total", moeda(r.valorTotal))}`;
    }
    return `
        ${itemResumo("Competencia", r.competencia || "-")}
        ${itemResumo("Consumo Total", `${numero(r.consumoTotal, 2)} kWh`)}
        ${itemResumo("Valor Total Rateado", moeda(r.valorTotalRateado))}
        ${itemResumo("Registros", numero(r.registros))}`;
}

function renderizarRelatorio(relatorio) {
    if (!relatorio || !$("resultadoRelatorio")) return;
    let html = `
        <div id="areaRelatorioImpressao" class="relatorio-renderizado">
            <div class="cabecalho-detalhes">
                <div>
                    <h2>${relatorio.titulo}</h2>
                    <p>Dados gerados a partir dos rateios, leituras, ocupacoes e faturas cadastradas.</p>
                </div>
            </div>
            <div class="grid-resumo-relatorio">${renderizarResumoRelatorio(relatorio)}</div>
            <div class="tabela-scroll">
                <table>
                    <thead>
                        <tr>
                            <th>Competencia</th><th>Loja</th><th>Cliente</th><th>Situacao</th>
                            <th>Periodo</th><th>Consumo</th><th>Valor Rateado</th>
                        </tr>
                    </thead>
                    <tbody>`;
    (relatorio.linhas || []).forEach(linha => {
        html += `
            <tr>
                <td>${linha.competencia || "-"}</td>
                <td>${linha.lojaCodigo || "-"}</td>
                <td>${linha.clienteNome || "-"}</td>
                <td>${linha.situacao || "-"}</td>
                <td>${linha.periodoInicio || "-"} a ${linha.periodoFim || "-"}</td>
                <td>${numero(linha.consumo, 2)} kWh</td>
                <td>${moeda(linha.valorRateado)}</td>
            </tr>`;
    });
    html += (relatorio.linhas || []).length ? "</tbody></table></div></div>" : `<tr><td colspan="7">Nenhum registro encontrado para os filtros selecionados.</td></tr></tbody></table></div></div>`;
    $("resultadoRelatorio").innerHTML = html;
}

function exportarRelatorioPDF() {
    if (!relatorioAtual || !$("areaRelatorioImpressao")) {
        alert("Visualize um relatorio antes de gerar o PDF.");
        return;
    }
    const janela = window.open("", "_blank");
    janela.document.write(`
        <html>
            <head>
                <title>${relatorioAtual.titulo}</title>
                <style>
                    body{font-family:Arial,sans-serif;color:#1f2937;padding:24px}
                    h2{margin-bottom:4px}
                    p{color:#666}
                    .grid-resumo-relatorio{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}
                    .card-resumo-relatorio{border:1px solid #ddd;border-radius:8px;padding:12px}
                    .card-resumo-relatorio span{display:block;color:#666;font-size:12px}
                    .card-resumo-relatorio strong{display:block;margin-top:6px;font-size:18px}
                    table{width:100%;border-collapse:collapse;margin-top:16px}
                    th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:12px}
                    th{background:#f3f4f6}
                </style>
            </head>
            <body>${$("areaRelatorioImpressao").innerHTML}</body>
        </html>`);
    janela.document.close();
    janela.focus();
    janela.print();
}

document.addEventListener("DOMContentLoaded", () => {
    abrirTelaDashboard();
});
