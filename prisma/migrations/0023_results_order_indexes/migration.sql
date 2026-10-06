-- T-1103: indici per l'ordinamento dei risultati, default reale del provider di autocomplete e unicità
-- delle righe globali di brand e pattern. Le righe esistenti dei progetti restano invariate.

-- Ordinamento di RESULTS_ORDER_BY (score_source ASC, score DESC con i NULL in testa come nell'ORDER BY,
-- keyword ASC, id ASC) per la vista di progetto e per quella di sezione.
CREATE INDEX "keyword_candidates_results_order_project_idx" ON "keyword_candidates"("project_id", "score_source", "score" DESC, "keyword", "id");
CREATE INDEX "keyword_candidates_results_order_subproject_idx" ON "keyword_candidates"("subproject_id", "score_source", "score" DESC, "keyword", "id");

-- Default del provider di autocomplete: il provider reale al posto di MOCK (solo per i nuovi progetti).
ALTER TABLE "projects" ALTER COLUMN "autocomplete_provider" SET DEFAULT 'GOOGLE_DIRECT';

-- Righe globali (project_id NULL) uniche: l'unique (project_id, brand) non vale per i NULL. Prima si tolgono
-- i duplicati esistenti tenendo la riga più vecchia (created_at, poi id), poi l'indice unico parziale.
DELETE FROM "brand_blacklist" AS duplicate
USING "brand_blacklist" AS kept
WHERE duplicate."project_id" IS NULL
  AND kept."project_id" IS NULL
  AND duplicate."brand" = kept."brand"
  AND (duplicate."created_at", duplicate."id") > (kept."created_at", kept."id");
CREATE UNIQUE INDEX "brand_blacklist_global_brand_key" ON "brand_blacklist"("brand") WHERE "project_id" IS NULL;

DELETE FROM "expansion_patterns" AS duplicate
USING "expansion_patterns" AS kept
WHERE duplicate."project_id" IS NULL
  AND kept."project_id" IS NULL
  AND duplicate."pattern" = kept."pattern"
  AND (duplicate."created_at", duplicate."id") > (kept."created_at", kept."id");
CREATE UNIQUE INDEX "expansion_patterns_global_pattern_key" ON "expansion_patterns"("pattern") WHERE "project_id" IS NULL;
