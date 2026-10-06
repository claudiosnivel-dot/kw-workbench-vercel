-- T-906: credenziale Google Sheets da ricollegare dopo invalid_grant al rinnovo del token. Migrazione
-- additiva: colonna nullable, nessun backfill.
-- AlterTable
ALTER TABLE "google_sheets_credentials" ADD COLUMN "reauth_required_at" TIMESTAMP(3);
