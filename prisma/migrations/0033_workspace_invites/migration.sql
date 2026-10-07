-- T-1503: inviti in un workspace. Email sempre minuscola e ruolo ADMIN o MEMBER (mai OWNER: la proprietà passa solo
-- con il trasferimento), garantiti da vincoli CHECK; il token è salvato solo come SHA-256 esadecimale (64 caratteri),
-- valido 7 giorni e monouso (accepted_at). RLS abilitata senza policy (T-205, D-20).
-- CreateTable
CREATE TABLE "workspace_invites" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "invited_by_user_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_invites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspace_invites_email_lowercase" CHECK ("email" = lower("email")),
    CONSTRAINT "workspace_invites_role_not_owner" CHECK ("role" IN ('ADMIN', 'MEMBER'))
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_invites_token_hash_key" ON "workspace_invites"("token_hash");

-- CreateIndex
CREATE INDEX "workspace_invites_workspace_id_idx" ON "workspace_invites"("workspace_id");

-- CreateIndex
CREATE INDEX "workspace_invites_email_idx" ON "workspace_invites"("email");

-- AddForeignKey
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data API di Supabase chiusa anche sulla nuova tabella (T-205, D-20).
ALTER TABLE "workspace_invites" ENABLE ROW LEVEL SECURITY;
