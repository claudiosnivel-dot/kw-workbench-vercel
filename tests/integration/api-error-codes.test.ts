// Gate di T-1303 (AC-1303-2, AC-1303-3): elenco chiuso dei code d'errore, voci nei cataloghi e code nelle risposte.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postLocale } from "@/app/api/locale/route";
import { PATCH as patchProject } from "@/app/api/projects/[id]/route";
import { POST as createProject } from "@/app/api/projects/route";
import { API_ERROR_CODES, JOB_ERROR_CODES } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";
import en from "@/messages/en.json";
import it_ from "@/messages/it.json";
import { createUserWithSession, personalWorkspaceId } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

type ErrorBody = { error?: string; code?: string };

const ROOT = process.cwd();
const KNOWN_CODES = new Set<string>(API_ERROR_CODES);

function sourceFiles(directory: string): string[] {
  return readdirSync(join(ROOT, directory)).flatMap((entry) => {
    const path = `${directory}/${entry}`;
    if (statSync(join(ROOT, path)).isDirectory()) {
      return path === "lib/generated" ? [] : sourceFiles(path);
    }
    return path.endsWith(".ts") ? [path] : [];
  });
}

// Punti in cui una rotta o un modulo fissa il code di una risposta d'errore.
const CODE_PATTERNS = [
  /new AppError\(\s*\d+,\s*"([A-Z_]+)"/g,
  /super\(\s*\d+,\s*"([A-Z_]+)"/g,
  /AdminActionError\(\s*(?:"[^"]*"|\w+),\s*\d+,\s*"([A-Z_]+)"\s*\)/g,
  /new GoogleSheetsExportError\([^;]*?,\s*\d+,\s*"([A-Z_]+)"\s*\)/gs,
  /code = "([A-Z_]+)"/g,
  /\bcode: "([A-Z_]+)"/g,
  /errorResponse\(\s*\d+,\s*"([A-Z_]+)"/g,
];

function emittedCodes(): string[] {
  const codes = new Set<string>(Object.values(JOB_ERROR_CODES));
  for (const file of [...sourceFiles("app/api"), ...sourceFiles("lib")]) {
    const source = readFileSync(join(ROOT, file), "utf8");
    for (const pattern of CODE_PATTERNS) {
      for (const match of source.matchAll(pattern)) codes.add(match[1]);
    }
  }
  return [...codes].sort();
}

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("API_ERROR_CODES", () => {
  // covers: AC-1303-2
  it("ogni code ha la voce errors.<CODE> non vuota in it.json ed en.json, più errors.UNKNOWN", () => {
    const missing = [
      ["it", it_.errors],
      ["en", en.errors],
    ].flatMap(([locale, errors]) =>
      [...API_ERROR_CODES, "UNKNOWN"]
        .filter((code) => !(errors as Record<string, string | undefined>)[code]?.trim())
        .map((code) => `${locale}:${code}`)
    );

    expect(API_ERROR_CODES.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it("i code fissati da rotte e moduli appartengono all'elenco chiuso", () => {
    const codes = emittedCodes();

    expect(codes).toContain("LOCALE_UNSUPPORTED");
    expect(codes.filter((code) => !KNOWN_CODES.has(code))).toEqual([]);
  });
});

describe("risposte d'errore con un code dell'elenco", () => {
  // covers: AC-1303-3
  it("JSON malformato 400, progetto di un altro utente 404 e lingua non supportata 400 LOCALE_UNSUPPORTED", async () => {
    const a = await createUserWithSession({ displayName: "t1303-a" });
    const b = await createUserWithSession({ displayName: "t1303-b" });
    const projectOfA = await prisma.project.create({ data: { name: "Progetto di A", workspace_id: await personalWorkspaceId(a.user.id) } });

    const malformed = await callRoute(createProject, {
      method: "POST",
      url: "/api/projects",
      body: "{non è JSON",
      cookie: a.cookie,
    });
    // La GET di /api/projects/{id} non esiste più (handler rimosso con T-1101): stessa verifica di proprietà sulla PATCH.
    const foreign = await callRoute(patchProject, {
      method: "PATCH",
      url: `/api/projects/${projectOfA.id}`,
      body: { name: "Rinominato da B" },
      cookie: b.cookie,
      params: { id: projectOfA.id },
    });
    const unsupported = await callRoute(postLocale, {
      method: "POST",
      url: "/api/locale",
      body: { locale: "de" },
      cookie: a.cookie,
    });

    const bodies = [
      (await malformed.json()) as ErrorBody,
      (await foreign.json()) as ErrorBody,
      (await unsupported.json()) as ErrorBody,
    ];

    expect([malformed.status, foreign.status, unsupported.status]).toEqual([400, 404, 400]);
    for (const body of bodies) {
      expect(KNOWN_CODES.has(body.code ?? "")).toBe(true);
    }
    expect(bodies[2].code).toBe("LOCALE_UNSUPPORTED");
  });
});
