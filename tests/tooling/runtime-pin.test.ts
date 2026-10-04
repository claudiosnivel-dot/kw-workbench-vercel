// Gate di T-407 (AC-407-1…3): Node 24 fissato in package.json, .nvmrc, CI e build Vercel.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";
import { assertNodeMajor } from "../../scripts/vercel-build.mjs";

type Step = { uses?: string; with?: Record<string, unknown> };
type Workflow = { jobs: Record<string, { steps?: Step[] }> };

const ROOT = process.cwd();

function read(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

beforeAll(() => {
  vi.stubEnv("VERCEL", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("runtime Node 24", () => {
  // covers: AC-407-1
  it("engines.node è 24.x, .nvmrc contiene 24 e @types/node è della major 24", () => {
    const pkg = JSON.parse(read("package.json")) as {
      engines: { node: string };
      devDependencies: Record<string, string>;
    };

    expect(pkg.engines.node).toBe("24.x");
    expect(read(".nvmrc").trim()).toBe("24");
    expect(pkg.devDependencies["@types/node"].startsWith("24.")).toBe(true);
  });

  // covers: AC-407-2
  it("ogni actions/setup-node dei workflow legge .nvmrc e nessuno dichiara un'altra major", () => {
    const workflowFiles = readdirSync(join(ROOT, ".github/workflows")).filter((file) => /\.ya?ml$/.test(file));
    const setupSteps = workflowFiles.flatMap((file) => {
      const workflow = parse(read(join(".github/workflows", file))) as Workflow;
      return Object.values(workflow.jobs)
        .flatMap((job) => job.steps ?? [])
        .filter((step) => step.uses?.startsWith("actions/setup-node@"));
    });

    expect(setupSteps.length).toBeGreaterThan(0);
    for (const step of setupSteps) {
      expect(step.with?.["node-version-file"]).toBe(".nvmrc");
      const declared = step.with?.["node-version"];
      if (declared !== undefined) {
        expect(String(declared)).toMatch(/^24(\.|$)/);
      }
    }
  });

  // covers: AC-407-3
  it("assertNodeMajor rifiuta Node 22 nominando Node 24 e accetta Node 24", () => {
    expect(() => assertNodeMajor("v22.11.0", 24)).toThrow(/Node 24/);
    expect(() => assertNodeMajor("v24.3.0", 24)).not.toThrow();
  });
});
