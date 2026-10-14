-- Macrotask 25 ux-plan, T-2501 (D-39): stato di scrittura delle pagine del piano (da scrivere, in scrittura,
-- pubblicata) con l'istante dell'ultimo cambio. Additiva: le pagine esistenti partono da scrivere.
CREATE TYPE "StrategyPageStatus" AS ENUM ('TODO', 'WRITING', 'PUBLISHED');

ALTER TABLE "strategy_pages"
  ADD COLUMN "status" "StrategyPageStatus" NOT NULL DEFAULT 'TODO',
  ADD COLUMN "status_changed_at" TIMESTAMP(3);

-- position diventa l'indice della pagina nell'ordine di lavoro (T-2501, T-2506: prossima pagina da scrivere): ogni hub,
-- in ordine di position, seguito dai propri spoke in ordine di position, come li mostra già la pagina del piano. Le
-- modifiche precedenti (promozione a hub, spoke di un hub eliminato) potevano lasciare buchi o salti: l'ordine mostrato
-- non cambia, cambiano solo i numeri.
WITH "ordered" AS (
  SELECT
    "page"."id",
    ROW_NUMBER() OVER (
      PARTITION BY "page"."strategy_id"
      ORDER BY
        COALESCE("hub"."position", "page"."position"),
        CASE WHEN "hub"."id" IS NULL THEN 0 ELSE 1 END,
        "page"."position",
        "page"."id"
    ) - 1 AS "work_order"
  FROM "strategy_pages" AS "page"
  LEFT JOIN "strategy_pages" AS "hub"
    ON "hub"."id" = "page"."hub_page_id" AND "page"."kind" = 'SPOKE' AND "hub"."kind" = 'HUB'
)
UPDATE "strategy_pages" SET "position" = "ordered"."work_order"
FROM "ordered"
WHERE "strategy_pages"."id" = "ordered"."id" AND "strategy_pages"."position" <> "ordered"."work_order";
