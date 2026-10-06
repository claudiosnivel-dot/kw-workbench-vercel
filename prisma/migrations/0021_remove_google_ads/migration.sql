-- T-901: rimozione dell'integrazione Google Ads (D-09; elementi 5 e 7 approvati dall'utente il 2026-10-06; D-05
-- consente il drop). Una sola transazione: dati portati a NONE, enum MetricsProvider ricreato senza
-- GOOGLE_KEYWORD_PLANNER (Postgres non toglie valori da un enum), tabella delle credenziali OAuth di Google Ads e
-- impostazioni GOOGLE_ADS_* (segreti cifrati) cancellate.
BEGIN;

-- Dati: nessun progetto, sezione, keyword o richiesta resta con il provider rimosso.
UPDATE "projects" SET "metrics_provider" = 'NONE' WHERE "metrics_provider" = 'GOOGLE_KEYWORD_PLANNER';
UPDATE "subprojects" SET "metrics_provider_override" = 'NONE' WHERE "metrics_provider_override" = 'GOOGLE_KEYWORD_PLANNER';
UPDATE "keyword_candidates" SET "metrics_provider" = 'NONE' WHERE "metrics_provider" = 'GOOGLE_KEYWORD_PLANNER';
UPDATE "metrics_provider_requests" SET "provider" = 'NONE' WHERE "provider" = 'GOOGLE_KEYWORD_PLANNER';

-- AlterEnum
CREATE TYPE "MetricsProvider_new" AS ENUM ('NONE', 'MOCK', 'DATAFORSEO', 'PLANNER_CSV');
ALTER TABLE "public"."keyword_candidates" ALTER COLUMN "metrics_provider" DROP DEFAULT;
ALTER TABLE "public"."projects" ALTER COLUMN "metrics_provider" DROP DEFAULT;
ALTER TABLE "projects" ALTER COLUMN "metrics_provider" TYPE "MetricsProvider_new" USING ("metrics_provider"::text::"MetricsProvider_new");
ALTER TABLE "subprojects" ALTER COLUMN "metrics_provider_override" TYPE "MetricsProvider_new" USING ("metrics_provider_override"::text::"MetricsProvider_new");
ALTER TABLE "keyword_candidates" ALTER COLUMN "metrics_provider" TYPE "MetricsProvider_new" USING ("metrics_provider"::text::"MetricsProvider_new");
ALTER TABLE "metrics_provider_requests" ALTER COLUMN "provider" TYPE "MetricsProvider_new" USING ("provider"::text::"MetricsProvider_new");
ALTER TYPE "MetricsProvider" RENAME TO "MetricsProvider_old";
ALTER TYPE "MetricsProvider_new" RENAME TO "MetricsProvider";
DROP TYPE "public"."MetricsProvider_old";
ALTER TABLE "keyword_candidates" ALTER COLUMN "metrics_provider" SET DEFAULT 'NONE';
ALTER TABLE "projects" ALTER COLUMN "metrics_provider" SET DEFAULT 'NONE';

-- DropTable
DROP TABLE "google_ads_credentials";

-- Impostazioni di Google Ads salvate dalla dashboard admin (client secret, developer token, refresh token cifrati).
DELETE FROM "app_settings" WHERE starts_with("key", 'GOOGLE_ADS_');

COMMIT;
