-- Creates merge_membros table
CREATE TABLE IF NOT EXISTS public."MERGE_MEMBROS" (
  id BIGSERIAL PRIMARY KEY,
  "MergeID" BIGINT NOT NULL REFERENCES public."MERGES"(id) ON DELETE CASCADE,
  "LojaID" BIGINT NOT NULL REFERENCES public."LOJAS"(id),
  "MedidorOriginal" TEXT NULL,
  "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_merge_membros_merge_loja ON public."MERGE_MEMBROS" ("MergeID", "LojaID");
CREATE INDEX IF NOT EXISTS idx_merge_membros_loja ON public."MERGE_MEMBROS" ("LojaID");
