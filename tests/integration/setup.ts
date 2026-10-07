import { beforeEach, vi } from "vitest";
import { assertLocalTestDatabase } from "../helpers/db-guard";
import { clearNextCache } from "../helpers/next-cache";

// La cache dati di Next (unstable_cache, revalidateTag) esiste solo nel server di Next: nei test è una mappa in
// memoria con gli stessi tag (T-1105), vuota all'inizio di ogni test.
vi.mock("next/cache", () => import("../helpers/next-cache"));
beforeEach(() => {
  clearNextCache();
});

// next-intl senza la configurazione per richiesta del plugin (T-1302): catalogo italiano, lingua di default, sia
// per le API server sia per gli hook dei Client Component resi con renderToStaticMarkup.
vi.mock("next-intl/server", () => import("../helpers/next-intl-server"));
vi.mock("next-intl", async (importOriginal) =>
  (await import("../helpers/next-intl-client")).withItalianCatalog(await importOriginal())
);

// Va eseguito prima di qualunque import di lib/prisma.ts: il client è un singleton creato all'import.
const url = assertLocalTestDatabase(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;

// Rete di sicurezza: se un import carica il .env della radice (lo faceva il client di Prisma 5;
// quello di Prisma 7 no, T-403), le variabili aggiunte si scartano e i test non usano valori reali.
const keysBeforePrisma = new Set(Object.keys(process.env));
await import("@/lib/prisma");
for (const key of Object.keys(process.env)) {
  if (!keysBeforePrisma.has(key)) {
    delete process.env[key];
  }
}
