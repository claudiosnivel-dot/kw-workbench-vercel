-- Macrotask 24 ux-keywords, T-2401 (D-39, D-19 emendata): un solo stato tieni/scarta. Una keyword è tenuta se
-- review_status è diverso da rejected, scartata se è rejected; la selezione per l'export sparisce.
-- Non additiva (D-05): la colonna selected_for_export va via con i suoi valori.

-- Le keyword di un marchio escluso ancora da rivedere partono scartate, come le nuove estratte dalla pipeline; quelle
-- già approvate a mano restano tenute.
UPDATE "keyword_candidates" SET "review_status" = 'rejected' WHERE "brand_status" = 'excluded' AND "review_status" = 'pending';

ALTER TABLE "keyword_candidates" DROP COLUMN "selected_for_export";
