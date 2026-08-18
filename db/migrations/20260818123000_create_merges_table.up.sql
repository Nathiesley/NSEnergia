-- Creates merges table
CREATE TABLE IF NOT EXISTS public."MERGES" (
  id BIGSERIAL PRIMARY KEY,
  "UnidadeID" BIGINT NOT NULL,
  "Nome" TEXT NOT NULL,
  "MedidorUnico" TEXT NOT NULL,
  "DataInicio" DATE NOT NULL,
  "DataFim" DATE NULL,
  "Ativo" BOOLEAN NOT NULL DEFAULT true,
  "CreatedBy" BIGINT NULL,
  "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "Note" TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_merges_unidade_data ON public."MERGES" ("UnidadeID", "DataInicio", "DataFim");
