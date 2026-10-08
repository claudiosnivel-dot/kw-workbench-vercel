// Gate di T-1705 (AC-1705-1…4): indicatori aggregati della piattaforma solo per il root admin, MRR stimato dagli
// abbonamenti salvati dai webhook, estrazioni per giorno e tasso di job falliti, senza dati dei progetti degli utenti.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getKpi } from "@/app/api/admin/kpi/route";
import { UserRole } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { seedSubscription } from "../helpers/billing-team";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

const NOW = new Date("2026-10-08T12:00:00.000Z");
const DAY_MS = 86_400_000;
const WHITELIST = ["extractionsPerDay", "failedJobRate7d", "mrr", "subscriptions", "users", "workspaces"];

type Kpi = {
  subscriptions: { byStatus: Record<string, number> };
  mrr: Record<string, number>;
  extractionsPerDay: { date: string; count: number }[];
  failedJobRate7d: number | null;
};

function readKpi(cookie?: string) {
  return callRoute(getKpi, { url: "/api/admin/kpi", cookie });
}

async function rootAdmin() {
  return createUserWithSession({ displayName: "t1705-root", role: UserRole.ADMIN, isRootAdmin: true });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  await resetDatabase();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("abbonamenti e MRR", () => {
  // covers: AC-1705-1
  it("conta 2 abbonamenti active e stima l'MRR in EUR dai cicli mensile e annuale, senza il disdetto", async () => {
    const root = await rootAdmin();
    const [monthly, yearly, canceled] = await Promise.all(
      ["mensile", "annuale", "disdetto"].map((name) => createUserWithSession({ displayName: `t1705-${name}` }))
    );
    await seedSubscription(monthly.workspaceId, { status: "active" });
    await seedSubscription(yearly.workspaceId, { status: "active" });
    await seedSubscription(canceled.workspaceId, { status: "canceled" });
    const amounts = [
      { workspaceId: monthly.workspaceId, amount: 1000n, interval: "month" },
      { workspaceId: yearly.workspaceId, amount: 12000n, interval: "year" },
      { workspaceId: canceled.workspaceId, amount: 5000n, interval: "month" },
    ];
    for (const { workspaceId, amount, interval } of amounts) {
      await prisma.workspaceSubscription.update({
        where: { workspace_id: workspaceId },
        data: { currency_code: "EUR", recurring_amount_minor: amount, billing_interval: interval, billing_frequency: 1, quantity: 1 },
      });
    }

    const response = await readKpi(root.cookie);
    const kpi = (await response.json()) as Kpi;

    expect(response.status).toBe(200);
    expect(kpi.subscriptions.byStatus.active).toBe(2);
    expect(kpi.mrr.EUR).toBe(2000);
  });
});

describe("estrazioni e job falliti", () => {
  // covers: AC-1705-2
  it("con 4 job completed e 1 failed recenti e 3 job di 40 giorni fa il tasso è 0.2 e le estrazioni sono 5 in 30 giorni", async () => {
    const root = await rootAdmin();
    const project = await prisma.project.create({ data: { name: "Job", workspace_id: root.workspaceId } });
    const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Generale", position: 0 } });
    const job = (status: "completed" | "failed", daysAgo: number) => ({
      project_id: project.id,
      subproject_id: section.id,
      status,
      created_at: new Date(NOW.getTime() - daysAgo * DAY_MS),
    });
    await prisma.job.createMany({
      data: [
        job("completed", 1),
        job("completed", 2),
        job("completed", 3),
        job("completed", 6),
        job("failed", 0),
        job("completed", 40),
        job("failed", 40),
        job("completed", 40),
      ],
    });

    const kpi = (await (await readKpi(root.cookie)).json()) as Kpi;

    expect(kpi.failedJobRate7d).toBe(0.2);
    expect(kpi.extractionsPerDay).toHaveLength(30);
    expect(kpi.extractionsPerDay.reduce((sum, day) => sum + day.count, 0)).toBe(5);
    expect(kpi.extractionsPerDay.at(-1)).toEqual({ date: "2026-10-08", count: 1 });
  });
});

describe("privacy", () => {
  // covers: AC-1705-3
  it("la risposta non contiene nomi di progetto, keyword, email o nomi degli utenti e ha solo le chiavi in whitelist", async () => {
    const root = await rootAdmin();
    const owner = await createUserWithSession({ displayName: "Utente-Riservato-777", email: "persona.nota@example.com" });
    const project = await prisma.project.create({ data: { name: "Progetto-Segreto-XYZ", workspace_id: owner.workspaceId } });
    const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Sezione", position: 0 } });
    await prisma.keywordCandidate.create({
      data: {
        project_id: project.id,
        subproject_id: section.id,
        keyword: "keyword-privata-123",
        normalized_keyword: "keyword-privata-123",
        canonical_keyword: "keyword-privata-123",
        source: "seed",
        source_query: "keyword-privata-123",
      },
    });
    await prisma.job.create({ data: { project_id: project.id, subproject_id: section.id, status: "completed" } });

    const response = await readKpi(root.cookie);
    const text = await response.text();

    for (const secret of ["Progetto-Segreto-XYZ", "keyword-privata-123", "persona.nota@example.com", "Utente-Riservato-777", root.user.email ?? "", "t1705-root"]) {
      expect(text).not.toContain(secret);
    }
    expect(Object.keys(JSON.parse(text) as object).sort()).toEqual(WHITELIST);
  });
});

describe("accesso", () => {
  // covers: AC-1705-4
  it("admin non root e abbonato ricevono 403, un anonimo 401", async () => {
    const admin = await createUserWithSession({ displayName: "t1705-admin", role: UserRole.ADMIN });
    const subscriber = await createUserWithSession({ displayName: "t1705-abbonato" });

    const statuses = [(await readKpi(admin.cookie)).status, (await readKpi(subscriber.cookie)).status, (await readKpi()).status];

    expect(statuses).toEqual([403, 403, 401]);
  });
});
