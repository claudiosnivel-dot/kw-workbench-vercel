import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type Step = { name?: string; run?: string; uses?: string; env?: Record<string, string> };
type Job = {
  env?: Record<string, string>;
  services?: Record<string, { image?: string }>;
  steps: Step[];
};
type Workflow = { on: Record<string, unknown>; permissions: unknown; jobs: Record<string, Job> };

const raw = readFileSync(join(process.cwd(), ".github/workflows/ci.yml"), "utf8");
const workflow = parse(raw) as Workflow;
const jobs = Object.values(workflow.jobs);
const steps = jobs.flatMap((job) => job.steps);
const runs = steps.map((step) => step.run ?? "").join("\n");

function hostOf(url: string): string {
  return new URL(url).hostname;
}

describe("CI GitHub Actions", () => {
  // covers: AC-110-1
  it("ha i job checks, integration, e2e e build con i comandi del progetto e Postgres 16", () => {
    expect(Object.keys(workflow.jobs).sort()).toEqual(["build", "checks", "e2e", "integration"]);
    for (const command of [
      "npm ci",
      "npx prisma generate",
      "npm run typecheck",
      "npm run lint",
      "npm run test:unit",
      "npm run test:component",
      "npm run test:tooling",
      "npm run test:integration",
      "npm run test:e2e",
      "npm run build",
    ]) {
      expect(runs).toContain(command);
    }
    expect(workflow.jobs.integration.services?.postgres?.image).toBe("postgres:16");
    expect(workflow.jobs.e2e.services?.postgres?.image).toBe("postgres:16");
  });

  // covers: AC-110-2
  it("non usa segreti e ogni URL di database punta a localhost", () => {
    expect(raw.split("secrets.").length - 1).toBe(0);

    const urls: string[] = [];
    for (const scope of [...jobs.map((job) => job.env), ...steps.map((step) => step.env)]) {
      for (const name of ["DATABASE_URL", "DIRECT_URL", "TEST_DATABASE_URL"]) {
        if (scope?.[name]) urls.push(scope[name]);
      }
    }
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.map(hostOf).filter((host) => host !== "localhost" && host !== "127.0.0.1")).toEqual([]);
  });

  // covers: AC-110-3
  it("non esegue comandi distruttivi sul DB, deploy o trigger privilegiati", () => {
    for (const forbidden of ["prisma db push", "prisma migrate reset", "vercel", "pull_request_target"]) {
      expect(raw.split(forbidden).length - 1).toBe(0);
    }
    expect(Object.keys(workflow.on)).not.toContain("pull_request_target");

    for (const job of jobs) {
      for (const step of job.steps.filter((s) => (s.run ?? "").includes("prisma migrate deploy"))) {
        const url = step.env?.DATABASE_URL ?? job.env?.DATABASE_URL ?? "";
        expect(["localhost", "127.0.0.1"]).toContain(hostOf(url));
      }
    }
  });

  // Fuori dal blueprint (decisione dell'utente del 2026-10-05): niente CI per i commit di sola documentazione,
  // come l'Ignored Build Step di Vercel (T-605); docs/ENVIRONMENTS.md la fa girare perché env-check.test.ts lo legge.
  it("non parte quando cambiano solo file sotto docs/, tranne ENVIRONMENTS.md", () => {
    for (const event of ["push", "pull_request"]) {
      expect(workflow.on[event]).toEqual({
        branches: ["master"],
        paths: ["**", "!docs/**", "docs/ENVIRONMENTS.md"],
      });
    }
  });

  // covers: AC-110-4
  it("ha permessi di sola lettura e azioni fissate per SHA", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });

    const uses = steps.map((step) => step.uses).filter((value): value is string => Boolean(value));
    expect(uses.length).toBeGreaterThan(0);
    expect(uses.filter((value) => !/@[0-9a-f]{40}$/.test(value))).toEqual([]);
  });
});
