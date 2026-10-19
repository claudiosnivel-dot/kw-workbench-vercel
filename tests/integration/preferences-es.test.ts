// Gate di T-4701 (AC-4701-4): lo spagnolo non si salva finché non è una lingua offerta (T-4902).
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

describe("lingua spagnola nelle preferenze prima di T-4902", () => {
  // covers: AC-4701-4
  it("PATCH con uiLocale es-ES risponde 400 VALIDATION_ERROR e la lingua dell'utente non cambia", async () => {
    const { user, cookie } = await createUserWithSession({ displayName: "utente-es" });
    await prisma.user.update({ where: { id: user.id }, data: { ui_locale: "en" } });

    for (const uiLocale of ["es-ES", "es-419"]) {
      const response = await callRoute(patchPreferences, { method: "PATCH", url: "/api/user/preferences", cookie, body: { uiLocale } });
      const body = (await response.json()) as { code?: string };

      expect(response.status).toBe(400);
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(await uiLocaleOf(user.id)).toBe("en");
    }
  });

  // covers: AC-4701-4
  it("una lingua offerta si salva, e anche POST /api/locale rifiuta lo spagnolo", async () => {
    const { user, cookie } = await createUserWithSession({ displayName: "utente-it" });

    const saved = await callRoute(patchPreferences, { method: "PATCH", url: "/api/user/preferences", cookie, body: { uiLocale: "it" } });
    expect(saved.status).toBe(200);
    expect(((await saved.json()) as { data: { uiLocale: string } }).data.uiLocale).toBe("it");
    expect(await uiLocaleOf(user.id)).toBe("it");

    const rejected = await callRoute(postLocale, { method: "POST", url: "/api/locale", cookie, body: { locale: "es-419" } });
    expect(rejected.status).toBe(400);
    expect(((await rejected.json()) as { code?: string }).code).toBe("LOCALE_UNSUPPORTED");
    expect(rejected.headers.get("set-cookie")).toBeNull();
    expect(await uiLocaleOf(user.id)).toBe("it");
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
