-- Macrotask 72 mcp-server, T-7201 (D-64). Migrazione additiva: nessuna riga esistente cambia.
-- agent_calls: il registro delle chiamate di strumento del server MCP di Claude Code. Ogni tools/call scrive una riga
-- con strumento, progetto, esito e durata; mai i parametri, i testi o la chiave (CWE-532). project_id torna nullo se il
-- progetto viene eliminato, così il registro resta.
-- RLS abilitata senza policy, come le altre tabelle di public (T-205, D-20).
-- CreateTable
CREATE TABLE "agent_calls" (
    "id" TEXT NOT NULL,
    "key_id" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "project_id" TEXT,
    "ok" BOOLEAN NOT NULL,
    "error_code" TEXT,
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_calls_created_at_idx" ON "agent_calls"("created_at");

-- AddForeignKey
ALTER TABLE "agent_calls" ADD CONSTRAINT "agent_calls_key_id_fkey" FOREIGN KEY ("key_id") REFERENCES "agent_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_calls" ADD CONSTRAINT "agent_calls_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_calls" ENABLE ROW LEVEL SECURITY;
