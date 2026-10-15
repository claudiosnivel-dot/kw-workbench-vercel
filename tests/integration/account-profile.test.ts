// Gate di T-2802 (AC-2802-1…3): il nome mostrato si cambia senza password, la password resta dietro la password attuale
// e durante il cambio password obbligato (T-1704) la rotta serve solo alla password.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as patchAuthConfig } from "@/app/api/auth/config/route";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

type Body = { code?: string; data?: { displayName?: string } };

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

function patchConfig(cookie: string, body: Record<string, unknown>) {
  return callRoute(patchAuthConfig, { method: "PATCH", url: "/api/auth/config", body, cookie });
}

function storedUser(id: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id },
    select: { display_name: true, password_hash: true, session_version: true },
  });
}

describe("nome mostrato e password", () => {
  // covers: AC-2802-1
  it("il solo nome mostrato si salva senza la password attuale e non revoca le sessioni", async () => {
    const { user, cookie } = await createUserWithSession({ displayName: "Vecchio" });
    const before = await storedUser(user.id);

    const response = await patchConfig(cookie, { displayName: "Nuovo nome" });
    const body = (await response.json()) as Body;
    const after = await storedUser(user.id);

    expect(response.status).toBe(200);
    expect(body.data?.displayName).toBe("Nuovo nome");
    expect(after.display_name).toBe("Nuovo nome");
    expect(after.session_version).toBe(before.session_version);
  });

  // covers: AC-2802-2
  it("la nuova password senza password attuale o con quella errata è rifiutata e l'hash non cambia", async () => {
    const { user, cookie } = await createUserWithSession();
    const before = await storedUser(user.id);

    const missing = await patchConfig(cookie, { newPassword: "nuova-password-2802", confirmPassword: "nuova-password-2802" });
    const wrong = await patchConfig(cookie, {
      currentPassword: "password-sbagliata",
      newPassword: "nuova-password-2802",
      confirmPassword: "nuova-password-2802",
    });
    const after = await storedUser(user.id);

    expect(missing.status).toBe(400);
    expect(((await missing.json()) as Body).code).toBe("CURRENT_PASSWORD_REQUIRED");
    expect(wrong.status).toBe(401);
    expect(((await wrong.json()) as Body).code).toBe("CURRENT_PASSWORD_INVALID");
    expect(after.password_hash).toBe(before.password_hash);
  });

  // covers: AC-2802-3
  it("durante il cambio password obbligato il solo nome mostrato risponde 403 e non si salva", async () => {
    const { user, cookie } = await createUserWithSession({ displayName: "Obbligato" });
    await prisma.user.update({ where: { id: user.id }, data: { must_change_password: true } });

    const response = await patchConfig(cookie, { displayName: "Nome nuovo" });
    const after = await storedUser(user.id);

    expect(response.status).toBe(403);
    expect(((await response.json()) as Body).code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect(after.display_name).toBe("Obbligato");
  });
});
