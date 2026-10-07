-- T-1501 (D-08, D-05): workspace e membership; la proprietà dei progetti passa dall'utente al workspace. Ogni utente
-- esistente riceve il suo workspace personale con una membership OWNER e i suoi progetti vi si spostano; poi
-- owner_user_id viene eliminata (migrazione drastica ammessa da D-05: il codice precedente non funziona sullo schema
-- nuovo). RLS abilitata senza policy sulle nuove tabelle (T-205, D-20).

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "personal_for_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_personal_for_user_id_key" ON "workspaces"("personal_for_user_id");

-- CreateIndex
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_workspace_id_user_id_key" ON "memberships"("workspace_id", "user_id");

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_personal_for_user_id_fkey" FOREIGN KEY ("personal_for_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Workspace personale per ogni utente: nome = display_name (T-1401), slug derivato dall'id e quindi univoco. L'id è
-- calcolato riga per riga nella CTE (gen_random_uuid() nella select list, mai in una sottoquery non correlata).
WITH "personal" AS (
    SELECT gen_random_uuid()::text AS "id", "id" AS "user_id", "display_name" FROM "users"
)
INSERT INTO "workspaces" ("id", "name", "slug", "personal_for_user_id", "created_at", "updated_at")
SELECT "id", "display_name", 'ws-' || "id", "user_id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "personal";

-- Membership OWNER di ogni utente nel suo workspace personale.
INSERT INTO "memberships" ("id", "workspace_id", "user_id", "role", "created_at")
SELECT gen_random_uuid()::text, "id", "personal_for_user_id", 'OWNER', CURRENT_TIMESTAMP FROM "workspaces";

-- AlterTable: colonne nullable finché i progetti non sono assegnati.
ALTER TABLE "projects" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "workspace_id" TEXT;

-- I progetti con proprietario vanno nel suo workspace personale, con l'autore uguale al vecchio proprietario.
UPDATE "projects" AS p
SET "workspace_id" = w."id", "created_by_user_id" = p."owner_user_id"
FROM "workspaces" AS w
WHERE w."personal_for_user_id" = p."owner_user_id";

-- Progetti orfani (owner_user_id NULL, finora invisibili a chiunque): al workspace personale del root admin; senza
-- root admin (in particolare con users vuota) vengono eliminati. Il conteggio non è mai silenzioso.
DO $$
DECLARE
    root_workspace_id TEXT;
    reassigned INTEGER := 0;
    deleted INTEGER := 0;
BEGIN
    SELECT w."id" INTO root_workspace_id
    FROM "workspaces" AS w
    JOIN "users" AS u ON u."id" = w."personal_for_user_id"
    WHERE u."is_root_admin" = true
    LIMIT 1;

    IF root_workspace_id IS NOT NULL THEN
        UPDATE "projects" SET "workspace_id" = root_workspace_id WHERE "workspace_id" IS NULL;
        GET DIAGNOSTICS reassigned = ROW_COUNT;
    ELSE
        DELETE FROM "projects" WHERE "workspace_id" IS NULL;
        GET DIAGNOSTICS deleted = ROW_COUNT;
    END IF;

    RAISE NOTICE 'workspaces: progetti orfani riassegnati al root admin: %, eliminati: %', reassigned, deleted;
END $$;

ALTER TABLE "projects" ALTER COLUMN "workspace_id" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_owner_user_id_fkey";

-- DropIndex
DROP INDEX "projects_owner_user_id_idx";

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "owner_user_id";

-- CreateIndex
CREATE INDEX "projects_workspace_id_idx" ON "projects"("workspace_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data API di Supabase chiusa anche sulle nuove tabelle (T-205, D-20).
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
