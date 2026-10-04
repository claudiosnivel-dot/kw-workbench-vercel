// Gate di T-506 (AC-506-1…AC-506-4): branding validato per intero, scritto in una transazione e riservato al root admin.
import { randomBytes } from "node:crypto";
import { UserRole } from "@/lib/generated/prisma/enums";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as patchBranding } from "@/app/api/settings/branding/route";
import { resetEnvForTests } from "@/lib/env";
import { getManySettingValues, upsertSettingValue } from "@/lib/integrations/app-settings";
import { getBrandingSnapshot } from "@/lib/integrations/branding";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

type ErrorBody = { code?: string };
type SnapshotBody = { data?: { logoUrl?: string } };

// Chiave di cifratura generata a ogni esecuzione: nessun valore letterale nel sorgente.
const ENCRYPTION_KEY = randomBytes(32).toString("hex");

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("APP_ENCRYPTION_KEY", ENCRYPTION_KEY);
  resetEnvForTests();
});

afterAll(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

beforeEach(async () => {
  await resetDatabase();
});

async function rootCookie(): Promise<string> {
  return (await createUserWithSession({ username: "root-506", role: UserRole.ADMIN, isRootAdmin: true })).cookie;
}

async function patch(cookie: string, body: Record<string, unknown>): Promise<Response> {
  return callRoute(patchBranding, { method: "PATCH", url: "/api/settings/branding", cookie, body });
}

function pngDataUrl(decodedBytes: number): string {
  return `data:image/png;base64,${Buffer.alloc(decodedBytes, 7).toString("base64")}`;
}

async function brandRows() {
  return prisma.appSetting.findMany({
    where: { key: { startsWith: "APP_BRAND_" } },
    orderBy: { key: "asc" },
    select: { key: true, value_encrypted: true },
  });
}

describe("validazione prima di ogni scrittura", () => {
  // covers: AC-506-1
  it("un logo http rifiutato lascia invariato il nome già salvato", async () => {
    const cookie = await rootCookie();
    await upsertSettingValue({ key: "APP_BRAND_NAME", value: "Vecchio" });

    const response = await patch(cookie, { appName: "Nuovo", logoUrlDark: "http://example.com/l.png" });

    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorBody).code).toBe("VALIDATION_ERROR");
    expect((await getManySettingValues(["APP_BRAND_NAME"])).APP_BRAND_NAME).toBe("Vecchio");
  });
});

describe("limite dei logo inline", () => {
  // covers: AC-506-2
  it("rifiuta un data URL oltre 100 KB decodificati e accetta quello di 100 KB esatti", async () => {
    const cookie = await rootCookie();

    const tooLarge = await patch(cookie, { logoUrl: pngDataUrl(102401) });
    const atLimit = await patch(cookie, { logoUrl: pngDataUrl(102400) });

    expect(tooLarge.status).toBe(400);
    expect(((await tooLarge.json()) as ErrorBody).code).toBe("VALIDATION_ERROR");
    expect(atLimit.status).toBe(200);
    expect(((await atLimit.json()) as SnapshotBody).data?.logoUrl).toBe(pngDataUrl(102400));
  });
});

describe("origini ammesse per il logo", () => {
  // covers: AC-506-3
  it("rifiuta URL protocol-relative, javascript: e data: non immagine e accetta https", async () => {
    const cookie = await rootCookie();
    const rejected = ["//evil.example/x.png", "javascript:alert(1)", "data:text/html;base64,PGI+"];

    for (const logoUrl of rejected) {
      expect((await patch(cookie, { logoUrl })).status).toBe(400);
    }
    expect((await patch(cookie, { logoUrl: "https://cdn.example.com/logo.png" })).status).toBe(200);
  });
});

describe("accesso riservato al root admin", () => {
  // covers: AC-506-4
  it("un ADMIN non root riceve 403 FORBIDDEN e le righe APP_BRAND_* non cambiano", async () => {
    const { cookie } = await createUserWithSession({ username: "admin-506", role: UserRole.ADMIN });
    await upsertSettingValue({ key: "APP_BRAND_NAME", value: "Vecchio" });
    const before = await brandRows();

    const response = await patch(cookie, { appName: "Nome di un admin" });

    expect(response.status).toBe(403);
    expect(((await response.json()) as ErrorBody).code).toBe("FORBIDDEN");
    expect(await brandRows()).toEqual(before);
  });
});

describe("lettura dei valori salvati prima di T-506", () => {
  it("ignora un logo http e un nome con caratteri di controllo usando i valori predefiniti", async () => {
    await upsertSettingValue({ key: "APP_BRAND_LOGO_URL_DARK", value: "http://example.com/vecchio.png" });
    await upsertSettingValue({ key: "APP_BRAND_NAME", value: "Nomerotto" });

    const snapshot = await getBrandingSnapshot();

    expect(snapshot.logoUrlDark).toBe("");
    expect(snapshot.appName).toBe("Seo God Mode");
  });
});
