// La CLI di Prisma 7 non carica più il .env da sola: in locale lo carica dotenv, su Vercel e in CI
// le variabili arrivano dall'ambiente (dotenv non sovrascrive quelle già impostate).
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Comandi che non si collegano al DB: devono funzionare senza DIRECT_URL (postinstall, CI, clone pulito).
const OFFLINE_COMMANDS = new Set(["generate", "validate", "format", "version", "--version", "-v", "--help", "-h"]);
const command = process.argv[2] ?? "--help";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // Connessione diretta o session pooler, mai il transaction pooler: in v7 directUrl non esiste più.
  // Per gli altri comandi env() lancia "Cannot resolve environment variable: DIRECT_URL." se manca.
  datasource: {
    url: OFFLINE_COMMANDS.has(command) ? process.env.DIRECT_URL : env("DIRECT_URL"),
  },
});
