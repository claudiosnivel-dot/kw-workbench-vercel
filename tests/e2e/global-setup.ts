import { spawnSync } from "node:child_process";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/security/password";
import { assertLocalTestDatabase } from "../helpers/db-guard";
import { resetDatabase } from "../helpers/db";
import { E2E_USER_PASSWORD, E2E_USERNAME } from "./credentials";

// Timestamp fissi: date e ordinamenti delle pagine fotografate non dipendono dall'ora dell'esecuzione.
const FIXED_AT = new Date("2026-01-15T09:30:00.000Z");
const INTENTS = ["informational", "commercial", "transactional", "navigational", "mixed"] as const;

/** Guardia, migrazioni, reset e dati seed deterministici per gli E2E. */
export default async function globalSetup(): Promise<void> {
  const url = assertLocalTestDatabase(process.env.TEST_DATABASE_URL);

  const migrate = spawnSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    encoding: "utf8",
  });
  if (migrate.status !== 0) {
    throw new Error(`prisma migrate deploy sul DB di test fallito (exit ${migrate.status}):\n${migrate.stderr}`);
  }

  await resetDatabase();

  // impacted-by: T-1105 (il login non promuove più il primo utente a root admin quando la tabella users non è
  // vuota): l'utente seed nasce root admin, come diventava al primo login, e può salvare il branding (T-1104).
  const user = await prisma.user.create({
    data: {
      username: E2E_USERNAME,
      password_hash: await hashPassword(E2E_USER_PASSWORD),
      role: "ADMIN",
      is_root_admin: true,
      created_at: FIXED_AT,
      updated_at: FIXED_AT,
    },
  });

  // Account Google Sheets collegato (T-1104, AC-1104-2): la modale di export mostra il modulo. Il token non è
  // cifrato con la chiave del server, quindi la credenziale risulta da ricollegare ma resta collegata.
  await prisma.googleSheetsCredential.create({
    data: { user_id: user.id, refresh_token_encrypted: "e2e-token-non-reale", connected_email: "e2e@example.com" },
  });

  // Con onboarding non completato app/page.tsx redirige a /onboarding.
  await prisma.userOnboardingProgress.create({
    data: {
      user_id: user.id,
      status: "COMPLETED",
      current_step: "REVIEW_EXPORT",
      completed_at: FIXED_AT,
      created_at: FIXED_AT,
      updated_at: FIXED_AT,
    },
  });

  const project = await prisma.project.create({
    data: {
      name: "Progetto E2E",
      owner_user_id: user.id,
      language_code: "it",
      country_code: "IT",
      created_at: FIXED_AT,
      updated_at: FIXED_AT,
    },
  });
  const section = await prisma.subproject.create({
    data: { project_id: project.id, name: "Generale", position: 0, created_at: FIXED_AT, updated_at: FIXED_AT },
  });
  await prisma.project.update({
    where: { id: project.id },
    data: { default_subproject_id: section.id, updated_at: FIXED_AT },
  });

  await prisma.keywordCandidate.createMany({
    data: Array.from({ length: 30 }, (_, index) => {
      const n = index + 1;
      const keyword = `keyword di prova ${String(n).padStart(2, "0")}`;
      return {
        project_id: project.id,
        subproject_id: section.id,
        keyword,
        normalized_keyword: keyword,
        canonical_keyword: keyword,
        source: "MOCK",
        source_query: "keyword di prova",
        search_intent: INTENTS[index % INTENTS.length],
        metrics_status: "mock" as const,
        metrics_provider: "MOCK" as const,
        avg_monthly_searches: n * 100,
        competition: (n % 10) / 10,
        score: 100 - n,
        created_at: FIXED_AT,
        updated_at: FIXED_AT,
      };
    }),
  });

  // Le variabili impostate nel global setup arrivano ai worker dei test.
  process.env.E2E_PROJECT_ID = project.id;
  await prisma.$disconnect();
}
