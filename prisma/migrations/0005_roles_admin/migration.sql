-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'SUBSCRIBER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "users"
ADD COLUMN "role" "UserRole",
ADD COLUMN "status" "UserStatus",
ADD COLUMN "is_root_admin" BOOLEAN,
ADD COLUMN "last_login_at" TIMESTAMP(3);

-- Backfill defaults for existing records
UPDATE "users"
SET
  "role" = 'SUBSCRIBER',
  "status" = 'ACTIVE',
  "is_root_admin" = FALSE
WHERE
  "role" IS NULL
  OR "status" IS NULL
  OR "is_root_admin" IS NULL;

-- Promote legacy admin username if present
UPDATE "users"
SET
  "role" = 'ADMIN',
  "status" = 'ACTIVE',
  "is_root_admin" = TRUE
WHERE "username" = 'admin';

-- Anti-lockout: if no root admin exists, promote oldest user
DO $$
DECLARE
  oldest_user_id TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "users" WHERE "is_root_admin" = TRUE) THEN
    SELECT "id"
    INTO oldest_user_id
    FROM "users"
    ORDER BY "created_at" ASC
    LIMIT 1;

    IF oldest_user_id IS NOT NULL THEN
      UPDATE "users"
      SET
        "role" = 'ADMIN',
        "status" = 'ACTIVE',
        "is_root_admin" = TRUE
      WHERE "id" = oldest_user_id;
    END IF;
  END IF;
END
$$;

-- Ensure exactly one root admin max
CREATE UNIQUE INDEX "users_single_root_admin_idx" ON "users"("is_root_admin") WHERE "is_root_admin" = TRUE;

-- Set defaults and required constraints
ALTER TABLE "users"
ALTER COLUMN "role" SET DEFAULT 'SUBSCRIBER',
ALTER COLUMN "role" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'ACTIVE',
ALTER COLUMN "status" SET NOT NULL,
ALTER COLUMN "is_root_admin" SET DEFAULT FALSE,
ALTER COLUMN "is_root_admin" SET NOT NULL;

-- Supporting indexes
CREATE INDEX "users_role_idx" ON "users"("role");
CREATE INDEX "users_status_idx" ON "users"("status");