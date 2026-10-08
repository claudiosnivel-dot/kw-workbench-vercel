-- T-1704: registro delle azioni amministrative (solo inserimenti) e cambio password obbligato dopo un reset da admin.
-- AlterTable
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "metadata" JSONB NOT NULL,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_log_created_at_idx" ON "admin_audit_log"("created_at");

-- CreateIndex
CREATE INDEX "admin_audit_log_target_type_target_id_idx" ON "admin_audit_log"("target_type", "target_id");

-- Data API di Supabase chiusa anche sulla nuova tabella (T-205, D-20).
ALTER TABLE "admin_audit_log" ENABLE ROW LEVEL SECURITY;
