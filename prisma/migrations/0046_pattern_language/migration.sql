-- Macrotask 37 quick-start-seeds, T-3702 (D-44): lingua delle composizioni. Additiva: le righe di oggi, comprese le 8
-- globali inglesi del seed, restano 'en'; l'indice unico delle righe globali passa da (pattern) a (language_code,
-- pattern), così lo stesso pattern può esistere in più lingue. La RLS di expansion_patterns (0012) resta com'è.
ALTER TABLE "expansion_patterns" ADD COLUMN "language_code" TEXT NOT NULL DEFAULT 'en';
DROP INDEX "expansion_patterns_global_pattern_key";
CREATE UNIQUE INDEX "expansion_patterns_global_language_pattern_key" ON "expansion_patterns"("language_code", "pattern") WHERE "project_id" IS NULL;
