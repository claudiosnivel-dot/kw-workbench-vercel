// Gate di T-4701 (AC-4701-4, superato da T-4902): lo spagnolo non si salvava finché non era una lingua offerta; da T-4902
// es-ES ed es-419 si salvano dalle preferenze e da POST /api/locale, una lingua non supportata è ancora rifiutata.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postLocale } from "@/app/api/locale/route";
import { PATCH as patchPreferences } from "@/app/api/user/preferences/route";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

async function uiLocaleOf(userId: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { ui_locale: true } })).ui_locale;
}

describe("lingua spagnola nelle preferenze da T-4902", () => {
  // covers: AC-4701-4
  it("PATCH con uiLocale es-ES ed es-419 risponde 200 e salva la lingua; de risponde 400 VALIDATION_ERROR e non la cambia", async () => {
    const { user, cookie } = await createUserWithSession({ displayName: "utente-es" });
    await prisma.user.update({ where: { id: user.id }, data: { ui_locale: "en" } });

    const rejected = await callRoute(patchPreferences, { method: "PATCH", url: "/api/user/preferences", cookie, body: { uiLocale: "de" } });
    expect(rejected.status).toBe(400);
    expect(((await rejected.json()) as { code?: string }).code).toBe("VALIDATION_ERROR");
    expect(await uiLocaleOf(user.id)).toBe("en");

    for (const [uiLocale, stored] of [
      ["es-ES", "es_ES"],
      ["es-419", "es_419"],
    ] as const) {
      const response = await callRoute(patchPreferences, { method: "PATCH", url: "/api/user/preferences", cookie, body: { uiLocale } });

      expect(response.status).toBe(200);
      expect(((await response.json()) as { data: { uiLocale: string } }).data.uiLocale).toBe(uiLocale);
      expect(await uiLocaleOf(user.id)).toBe(stored);
    }
  });

  // covers: AC-4701-4
  it("POST /api/locale salva es-419 nell'utente e nel cookie e rifiuta una lingua non supportata", async () => {
    const { user, cookie } = await createUserWithSession({ displayName: "utente-it" });

    const saved = await callRoute(postLocale, { method: "POST", url: "/api/locale", cookie, body: { locale: "es-419" } });
    expect(saved.status).toBe(200);
    expect(saved.headers.get("set-cookie")).toContain("kwb_locale=es-419");
    expect(await uiLocaleOf(user.id)).toBe("es_419");

    const rejected = await callRoute(postLocale, { method: "POST", url: "/api/locale", cookie, body: { locale: "pt-BR" } });
    expect(rejected.status).toBe(400);
    expect(((await rejected.json()) as { code?: string }).code).toBe("LOCALE_UNSUPPORTED");
    expect(rejected.headers.get("set-cookie")).toBeNull();
    expect(await uiLocaleOf(user.id)).toBe("es_419");
  });

  // covers: AC-4701-4
  it("una lingua spagnola già salvata nel database si legge come tag dell'app", async () => {
    const { user, cookie } = await createUserWithSession({ displayName: "utente-latam" });
    await prisma.user.update({ where: { id: user.id }, data: { ui_locale: "es_419" } });

    const { GET } = await import("@/app/api/user/preferences/route");
    const response = await callRoute(GET, { url: "/api/user/preferences", cookie });

    expect(((await response.json()) as { data: { uiLocale: string } }).data.uiLocale).toBe("es-419");
  });
});
