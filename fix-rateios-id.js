// Corrige a chave primaria da tabela RATEIOS.
// RATEIOS usa a coluna "id" (minuscula), assim como LEITURAS, LOJAS e CLIENTES.
// FATURAS e OCUPACOES continuam usando "ID" e nao sao alteradas.
(function () {
    const atualizarRegistroOriginal = window.atualizarRegistro;
    const excluirRegistroOriginal = window.excluirRegistro;

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

    // A rotina de exclusao original usa "ID" fixo para todas as tabelas.
    // Aqui corrigimos somente RATEIOS para usar "id".
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
})();
