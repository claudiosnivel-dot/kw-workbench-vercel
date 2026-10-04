import { assertLocalTestDatabase } from "../helpers/db-guard";

// Va eseguito prima di qualunque import di lib/prisma.ts: il client è un singleton creato all'import.
const url = assertLocalTestDatabase(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;

// Il client Prisma, quando viene creato, carica il .env della radice nelle variabili non impostate:
// quelle aggiunte in quel momento si scartano, così i test non usano valori del .env reale.
const keysBeforePrisma = new Set(Object.keys(process.env));
await import("@/lib/prisma");
for (const key of Object.keys(process.env)) {
  if (!keysBeforePrisma.has(key)) {
    delete process.env[key];
  }
}
