// Corrige a coluna da chave primaria da tabela RATEIOS.
// A tabela usa "ID" (maiúsculo), enquanto a rotina original trata RATEIOS como "id".
(function () {
    const atualizarRegistroOriginal = window.atualizarRegistro;
    if (typeof atualizarRegistroOriginal !== "function") return;

    window.atualizarRegistro = async function (tabela, id, dados) {
        if (tabela === "RATEIOS") {
            const { data, error } = await db
                .from(tabela)
                .update(dados)
                .eq("ID", id)
                .select();

            if (error) throw error;
            return normalizarRegistro(data?.[0]);
        }

        return atualizarRegistroOriginal(tabela, id, dados);
    };
})();
