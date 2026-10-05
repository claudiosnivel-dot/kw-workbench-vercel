// Gate di T-908 (AC-908-1, AC-908-2, AC-908-4): configurazione OAuth di Google Sheets con override azzerabili,
// validazione atomica e segreto mai restituito; nessuna rotta per le credenziali del fornitore di metriche.
import { readdirSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getConfig, PATCH as patchConfig } from "@/app/api/integrations/google-sheets/config/route";
import { resetEnvForTests } from "@/lib/env";
import { UserRole } from "@/lib/generated/prisma/client";
import { upsertSettingValue } from "@/lib/integrations/app-settings";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

const CONFIG_URL = "/api/integrations/google-sheets/config";

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
  );
}

afterAll(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

beforeEach(async () => {
  await resetDatabase();
  vi.unstubAllEnvs();
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
  resetEnvForTests();
});

describe("configurazione OAuth di Google Sheets", () => {
  // covers: AC-908-1
  it("con clientId null elimina l'override e torna al valore d'ambiente", async () => {
    vi.stubEnv("GOOGLE_SHEETS_OAUTH_CLIENT_ID", "env-id.apps.googleusercontent.com");
    await upsertSettingValue({ key: "GOOGLE_SHEETS_OAUTH_CLIENT_ID", value: "db-id.apps.googleusercontent.com" });
    const root = await createUserWithSession({ role: UserRole.ADMIN, isRootAdmin: true });

    const response = await callRoute(patchConfig, { method: "PATCH", url: CONFIG_URL, cookie: root.cookie, body: { clientId: null } });

    expect(response.status).toBe(200);
    expect(await prisma.appSetting.count({ where: { key: "GOOGLE_SHEETS_OAUTH_CLIENT_ID" } })).toBe(0);
    const snapshot = await callRoute(getConfig, { url: CONFIG_URL, cookie: root.cookie });
    const data = ((await snapshot.json()) as { data: { clientId: string; sources: { clientId: string } } }).data;
    expect(data.clientId).toBe("env-id.apps.googleusercontent.com");
    expect(data.sources.clientId).toBe("env");
  });

  // covers: AC-908-2
  it("un valore non valido riceve 400 e un ADMIN non root 403, senza scritture", async () => {
    await upsertSettingValue({ key: "GOOGLE_SHEETS_OAUTH_CLIENT_ID", value: "db-id.apps.googleusercontent.com" });
    await upsertSettingValue({
      key: "GOOGLE_SHEETS_OAUTH_REDIRECT_URI",
      value: "https://app.example.com/api/integrations/google-sheets/callback",
    });
    const before = await prisma.appSetting.findMany({ select: { key: true, updated_at: true }, orderBy: { key: "asc" } });
    const root = await createUserWithSession({ role: UserRole.ADMIN, isRootAdmin: true });
    const admin = await createUserWithSession({ role: UserRole.ADMIN });

    const invalid = await callRoute(patchConfig, {
      method: "PATCH",
      url: CONFIG_URL,
      cookie: root.cookie,
      body: { clientId: "altro-id.apps.googleusercontent.com", redirectUri: "ftp://x" },
    });
    const forbidden = await callRoute(patchConfig, {
      method: "PATCH",
      url: CONFIG_URL,
      cookie: admin.cookie,
      body: { clientId: "valido-id.apps.googleusercontent.com" },
    });

    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { code?: string }).code).toBeTruthy();
    expect(forbidden.status).toBe(403);
    const after = await prisma.appSetting.findMany({ select: { key: true, updated_at: true }, orderBy: { key: "asc" } });
    expect(after).toEqual(before);
  });

  // covers: AC-908-4
  it("non restituisce mai il client secret e nessuna rotta riguarda le credenziali del fornitore", async () => {
    await upsertSettingValue({ key: "GOOGLE_SHEETS_OAUTH_CLIENT_SECRET", value: "SHEETS-SECRET-1", isSecret: true });
    const root = await createUserWithSession({ role: UserRole.ADMIN, isRootAdmin: true });

    const response = await callRoute(getConfig, { url: CONFIG_URL, cookie: root.cookie });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).not.toContain("SHEETS-SECRET-1");
    expect((JSON.parse(text) as { data: { hasClientSecret: boolean } }).data.hasClientSecret).toBe(true);
    expect(listFiles("app/api").filter((file) => file.toLowerCase().includes("dataforseo"))).toEqual([]);
  });
});
