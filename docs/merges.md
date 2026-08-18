# Mesclagem de Lojas (MERGES / MERGE_MEMBROS)

Este documento descreve a nova configuração de mesclagem de lojas adicionada na Fase 1.

Objetivo
- Registrar conjuntos de lojas que, a partir de uma data, passam a utilizar um único medidor sem alterar histórico.

Tabelas criadas
- MERGES: registro do conjunto (Nome, MedidorUnico, DataInicio, DataFim, UnidadeID, Ativo, CreatedAt, Note)
- MERGE_MEMBROS: membros do conjunto (MergeID, LojaID, MedidorOriginal, CreatedAt)

Aplicação das migrations
1. No Supabase SQL Editor cole o conteúdo de db/migrations/20260818123000_create_merges_table.up.sql e execute.
2. Em seguida cole db/migrations/20260818123000_create_merge_membros_table.up.sql e execute.

Reversão (caso necessário)
- Rode os arquivos .down.sql (create_*_table.down.sql) na ordem inversa.

Uso
- A UI adiciona um modal "Mesclar lojas" que cria um registro em MERGES e os membros em MERGE_MEMBROS.
- A função medidorEfetivo(lojaId, date) consulta MERGES + MERGE_MEMBROS: se houver um merge ativo aplicável, retorna MedidorUnico; caso contrário retorna LOJAS.Medidor.

Observações
- Nessa fase NÃO alteramos LOJAS.Medidor nem nenhuma leitura/ocupação/rateio existente.
- A mesclagem é reversível: setar MERGES.Ativo = false ou preencher DataFim.
