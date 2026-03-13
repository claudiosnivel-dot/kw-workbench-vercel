-- Normalize Google Ads credentials to a single global record.
DO $$
DECLARE
  root_user_id TEXT;
  source_credential_id TEXT;
BEGIN
  SELECT "id"
  INTO root_user_id
  FROM "users"
  WHERE "is_root_admin" = true
  ORDER BY "created_at" ASC
  LIMIT 1;

  IF root_user_id IS NOT NULL THEN
    SELECT "id"
    INTO source_credential_id
    FROM "google_ads_credentials"
    WHERE "user_id" = root_user_id
    ORDER BY "updated_at" DESC, "created_at" DESC
    LIMIT 1;
  END IF;

  IF source_credential_id IS NULL THEN
    SELECT "id"
    INTO source_credential_id
    FROM "google_ads_credentials"
    ORDER BY "updated_at" DESC, "created_at" DESC
    LIMIT 1;
  END IF;

  IF source_credential_id IS NOT NULL THEN
    UPDATE "google_ads_credentials"
    SET "singleton_key" = 'default',
        "user_id" = NULL
    WHERE "id" = source_credential_id;

    DELETE FROM "google_ads_credentials"
    WHERE "id" <> source_credential_id;
  ELSE
    DELETE FROM "google_ads_credentials";
  END IF;
END
$$;

UPDATE "google_ads_credentials"
SET "singleton_key" = 'default'
WHERE "singleton_key" IS NULL;

ALTER TABLE "google_ads_credentials"
  DROP CONSTRAINT IF EXISTS "google_ads_credentials_user_id_fkey";

DROP INDEX IF EXISTS "google_ads_credentials_user_id_key";
DROP INDEX IF EXISTS "google_ads_credentials_singleton_key_idx";
DROP INDEX IF EXISTS "google_ads_credentials_singleton_key_key";

ALTER TABLE "google_ads_credentials"
  DROP COLUMN IF EXISTS "user_id";

ALTER TABLE "google_ads_credentials"
  ALTER COLUMN "singleton_key" SET DEFAULT 'default',
  ALTER COLUMN "singleton_key" SET NOT NULL;

CREATE UNIQUE INDEX "google_ads_credentials_singleton_key_key"
  ON "google_ads_credentials"("singleton_key");
