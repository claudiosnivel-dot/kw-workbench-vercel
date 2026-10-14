// Gate di T-2502 (AC-2502-4): i vecchi indirizzi della pagina Strategia rispondono 308 verso il piano del progetto o
// verso la versione precedente in sola lettura.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as strategyRedirect } from "@/app/projects/[id]/strategy/[strategyId]/route";
import { GET as strategyListRedirect } from "@/app/projects/[id]/strategy/route";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { insertStrategy } from "../helpers/strategy";

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("reindirizzamento della pagina Strategia", () => {
  // covers: AC-2502-4
  it("strategy e la strategia del piano portano a /plan, una strategia precedente alla sua versione, tutte con 308", async () => {
    const owner = await createUserWithSession({ displayName: `t2502-redirect-${randomUUID().slice(0, 8)}` });
    const project = await prisma.project.create({ data: { name: "P", workspace_id: owner.workspaceId } });
    const pages = [{ key: "hub", kind: "HUB" as const, keywords: [{ text: "scarpe running", volume: 900 }] }];
    const previous = await insertStrategy({ projectId: project.id, pages, createdAt: new Date("2026-01-01") });
    const plan = await insertStrategy({ projectId: project.id, pages, createdAt: new Date("2026-02-01") });
    const target = (response: Response) => new URL(response.headers.get("location") ?? "", "http://localhost:3000").pathname;

    const list = await callRoute(strategyListRedirect, {
      url: `/projects/${project.id}/strategy`,
      cookie: owner.cookie,
      params: { id: project.id },
    });
    const [current, version] = await Promise.all(
      [plan.strategyId, previous.strategyId].map((strategyId) =>
        callRoute(strategyRedirect, {
          url: `/projects/${project.id}/strategy/${strategyId}`,
          cookie: owner.cookie,
          params: { id: project.id, strategyId },
        })
      )
    );

    expect([list.status, current.status, version.status]).toEqual([308, 308, 308]);
    expect(target(list)).toBe(`/projects/${project.id}/plan`);
    expect(target(current)).toBe(`/projects/${project.id}/plan`);
    expect(target(version)).toBe(`/projects/${project.id}/plan/versions/${previous.strategyId}`);
  });
});
