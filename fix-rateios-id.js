// Corrige a chave primaria da tabela RATEIOS.
// RATEIOS usa a coluna "id" (minuscula), assim como LEITURAS, LOJAS e CLIENTES.
// FATURAS e OCUPACOES continuam usando "ID" e nao sao alteradas.
(function () {
    const atualizarRegistroOriginal = window.atualizarRegistro;
    const excluirRegistroOriginal = window.excluirRegistro;
    const excluirRateiosPorCompetenciaOriginal = window.excluirRateiosPorCompetencia;

    if (typeof atualizarRegistroOriginal === "function") {
        window.atualizarRegistro = async function (tabela, id, dados) {
            if (tabela === "RATEIOS") {
                const { data, error } = await db
                    .from(tabela)
                    .update(dados)
                    .eq("id", id)
                    .select();

                if (error) throw error;
                return normalizarRegistro(data?.[0]);
            }

            return atualizarRegistroOriginal(tabela, id, dados);
        };
    }

    if (typeof excluirRegistroOriginal === "function") {
        window.excluirRegistro = async function (tabela, id) {
            if (tabela === "RATEIOS") {
                const { error } = await db
                    .from(tabela)
                    .delete()
                    .eq("id", id);

                if (error) throw error;
                return;
            }

            return excluirRegistroOriginal(tabela, id);
        };
    }

    // Ao gerar novamente um rateio, o sistema primeiro exclui o rateio
    // existente daquela competencia. RATEIOS usa "id", nao "ID".
    if (typeof excluirRateiosPorCompetenciaOriginal === "function") {
        window.excluirRateiosPorCompetencia = async function (unidadeId, competencia) {
            const { error } = await db
                .from("RATEIOS")
                .delete()
                .eq("UnidadeID", unidadeId)
                .eq("Competencia", competencia);

            if (error) throw error;
        };
    }
})();
