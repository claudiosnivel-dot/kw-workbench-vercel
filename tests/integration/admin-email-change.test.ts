// Gate di T-3402 (AC-3402-1…3): il root admin cambia l'email di un utente; con il lancio in pausa il nuovo indirizzo nasce
// verificato, con il lancio attivo parte la verifica. Riga di registro senza indirizzi e avviso al vecchio indirizzo.
import { UserRole } from "@/lib/generated/prisma/enums";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH as patchAdminUser } from "@/app/api/admin/users/[id]/route";
import { resetEnvForTests } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { setCommercialLaunchForTests } from "../helpers/launch";
import { flushAfter } from "../helpers/next-after";

type Body = { code?: string; data?: { email: string } };

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("EMAIL_TRANSPORT", "outbox");
  vi.stubEnv("APP_PUBLIC_URL", "https://app.example.test");
  resetEnvForTests();
  await resetDatabase();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

function patchEmail(targetId: string, cookie: string, email: string) {
  return callRoute(patchAdminUser, { method: "PATCH", url: `/api/admin/users/${targetId}`, body: { email }, cookie, params: { id: targetId } });
}

async function storedUser(id: string) {
  return prisma.user.findUniqueOrThrow({ where: { id }, select: { email: true, email_verified_at: true } });
}

describe("cambio email da root admin con il lancio in pausa", () => {
  // covers: AC-3402-1
  it("salva la nuova email già verificata, registra l'azione senza indirizzi e avvisa il vecchio indirizzo", async () => {
    const root = await createUserWithSession({ displayName: "t3402-root", role: UserRole.ADMIN, isRootAdmin: true });
    const target = await createUserWithSession({ displayName: "t3402-utente", email: "a@example.com", emailVerified: false });

    const response = await patchEmail(target.user.id, root.cookie, "b@example.com");
    await flushAfter();

    expect(response.status).toBe(200);
    expect(((await response.json()) as Body).data?.email).toBe("b@example.com");
    const stored = await storedUser(target.user.id);
    expect(stored.email).toBe("b@example.com");
    expect(stored.email_verified_at).not.toBeNull();
    const rows = await prisma.adminAuditLog.findMany({ where: { action: "user.email_change" } });
    expect(rows.map((row) => [row.actor_user_id, row.target_id])).toEqual([[root.user.id, target.user.id]]);
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain("a@example.com");
    expect(serialized).not.toContain("b@example.com");
    const emails = await prisma.emailOutbox.findMany();
    expect(emails.map((email) => [email.to_address, email.template])).toEqual([["a@example.com", "email-changed"]]);
  });
});

describe("chi può cambiare l'email e verso quale indirizzo", () => {
  // covers: AC-3402-2
  it("l'admin non root riceve 403 FORBIDDEN e un indirizzo di un altro utente 409 EMAIL_TAKEN", async () => {
    const root = await createUserWithSession({ displayName: "t3402-root-due", role: UserRole.ADMIN, isRootAdmin: true });
    const admin = await createUserWithSession({ displayName: "t3402-admin", role: UserRole.ADMIN });
    const subscriber = await createUserWithSession({ displayName: "t3402-sottoscrittore" });
    await createUserWithSession({ displayName: "t3402-altro", email: "c@example.com" });

    const fromAdmin = await patchEmail(subscriber.user.id, admin.cookie, "d@example.com");
    const taken = await patchEmail(subscriber.user.id, root.cookie, "c@example.com");

    expect(fromAdmin.status).toBe(403);
    expect(((await fromAdmin.json()) as Body).code).toBe("FORBIDDEN");
    expect(taken.status).toBe(409);
    expect(((await taken.json()) as Body).code).toBe("EMAIL_TAKEN");
    expect((await storedUser(subscriber.user.id)).email).toBe(subscriber.user.email);
  });
});

describe("cambio email da root admin con il lancio attivo", () => {
  // covers: AC-3402-3
  it("salva la nuova email da verificare e invia verify-email al nuovo indirizzo", async () => {
    await setCommercialLaunchForTests("live");
    const root = await createUserWithSession({ displayName: "t3402-root-tre", role: UserRole.ADMIN, isRootAdmin: true });
    const target = await createUserWithSession({ displayName: "t3402-da-verificare" });

    const response = await patchEmail(target.user.id, root.cookie, "e@example.com");
    await flushAfter();

    expect(response.status).toBe(200);
    const stored = await storedUser(target.user.id);
    expect(stored.email).toBe("e@example.com");
    expect(stored.email_verified_at).toBeNull();
    const verifications = await prisma.emailOutbox.findMany({ where: { template: "verify-email" } });
    expect(verifications.map((email) => email.to_address)).toEqual(["e@example.com"]);
  });
});
