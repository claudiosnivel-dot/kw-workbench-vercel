-- Macrotask 71 mcp-keys, T-7101 (D-64). Migrazione additiva: nessuna riga esistente cambia.
-- agent_keys: la chiave personale di Claude Code del root admin. La chiave in chiaro non si salva mai: restano il suo
-- SHA-256 esadecimale (64 caratteri, unico) e il prefisso mostrato nella card; expires_at nullo vuol dire «Mai».
-- RLS abilitata senza policy, come le altre tabelle di public (T-205, D-20).
-- CreateTable
CREATE TABLE "agent_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "key_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "agent_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_keys_key_hash_key" ON "agent_keys"("key_hash");

-- CreateIndex
CREATE INDEX "agent_keys_user_id_created_at_idx" ON "agent_keys"("user_id", "created_at");

-- Una sola chiave non revocata per utente: anche due creazioni contemporanee non lasciano due chiavi attive. Prisma non
-- esprime gli indici parziali: c'è solo qui.
CREATE UNIQUE INDEX "agent_keys_single_active_idx" ON "agent_keys"("user_id") WHERE "revoked_at" IS NULL;

-- AddForeignKey
ALTER TABLE "agent_keys" ADD CONSTRAINT "agent_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_keys" ENABLE ROW LEVEL SECURITY;
