-- T-1103, decisioni dell'utente del 2026-10-06: via gli indici ridondanti e la colonna mai letta is_secret.
-- google_sheets_credentials_user_id_idx duplica l'unique google_sheets_credentials_user_id_key; users_role_idx e
-- users_status_idx indicizzano colonne a bassa cardinalità. Gli indici keyword_candidates restano: EXPLAIN li
-- mostra usati da conteggi, filtri selettivi ed export.
DROP INDEX "google_sheets_credentials_user_id_idx";
DROP INDEX "users_role_idx";
DROP INDEX "users_status_idx";

-- app_settings.is_secret era scritta da upsertSettingValue e mai letta: gli snapshot non restituiscono già
-- valori segreti (per esempio hasClientSecret è un booleano).
ALTER TABLE "app_settings" DROP COLUMN "is_secret";
