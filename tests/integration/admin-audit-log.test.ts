// Gate di T-1704 (AC-1704-1…4): registro immutabile delle azioni amministrative, reset della password da admin con
// sessioni revocate, cambio password obbligato e avviso email, lettura del registro solo per il root admin.
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as readAuditLog } from "@/app/api/admin/audit-log/route";
import { DELETE as deleteAdminUser, PATCH as patchAdminUser } from "@/app/api/admin/users/[id]/route";
import { PATCH as patchAuthConfig } from "@/app/api/auth/config/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as createProject } from "@/app/api/projects/route";
import { PATCH as patchBranding } from "@/app/api/settings/branding/route";
import { resetEnvForTests } from "@/lib/env";
import { UserRole } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { flushAfter } from "../helpers/next-after";

const TEMPORARY_PASSWORD = "Temp-Pass-123";

type Body = { code?: string; redirect?: string; data?: { action: string; createdAt: string }[]; meta?: { nextCursor: string | null } };

function patchUser(targetId: string, cookie: string, body: Record<string, unknown>) {
  return callRoute(patchAdminUser, { method: "PATCH", url: `/api/admin/users/${targetId}`, body, cookie, params: { id: targetId } });
}

function createProjectWith(cookie: string, workspaceId: string) {
  return callRoute(createProject, { method: "POST", url: "/api/projects", body: { name: "Dopo il reset", workspaceId }, cookie });
}

beforeEach(async () => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
  vi.stubEnv("EMAIL_TRANSPORT", "outbox");
  vi.stubEnv("APP_PUBLIC_URL", "https://app.example.test");
  // Chiave generata a ogni esecuzione: app_settings (branding) è cifrata.
  vi.stubEnv("APP_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
  resetEnvForTests();
  await resetDatabase();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTests();
});

describe("reset della password da un admin", () => {
  // covers: AC-1704-1
  it("scrive una riga user.password_reset con autore e bersaglio e senza la password", async () => {
    const admin = await createUserWithSession({ displayName: "t1704-admin", role: UserRole.ADMIN });
    const subscriber = await createUserWithSession({ displayName: "t1704-utente" });

    const response = await patchUser(subscriber.user.id, admin.cookie, { newPassword: TEMPORARY_PASSWORD, confirmPassword: TEMPORARY_PASSWORD });

    expect(response.status).toBe(200);
    const rows = await prisma.adminAuditLog.findMany();
    expect(rows.map((row) => [row.action, row.actor_user_id, row.target_id])).toEqual([
      ["user.password_reset", admin.user.id, subscriber.user.id],
    ]);
    expect(JSON.stringify(rows[0])).not.toContain(TEMPORARY_PASSWORD);
  });

  // covers: AC-1704-2
  it("revoca le sessioni, obbliga al cambio password e avvisa l'utente via email", async () => {
    const admin = await createUserWithSession({ displayName: "t1704-admin", role: UserRole.ADMIN });
    const subscriber = await createUserWithSession({ displayName: "t1704-utente" });
    await patchUser(subscriber.user.id, admin.cookie, { newPassword: TEMPORARY_PASSWORD, confirmPassword: TEMPORARY_PASSWORD });
    await flushAfter();

    const oldSession = await createProjectWith(subscriber.cookie, subscriber.workspaceId);
    const signedIn = await callRoute(login, {
      method: "POST",
      url: "/api/auth/login",
      body: { email: "t1704-utente@example.test", password: TEMPORARY_PASSWORD },
    });
    const newCookie = (signedIn.headers.get("set-cookie") ?? "").split(";")[0];
    const blocked = await createProjectWith(newCookie, subscriber.workspaceId);

    expect(oldSession.status).toBe(401);
    expect(signedIn.status).toBe(200);
    expect((await signedIn.json()) as Body).toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED", redirect: "/account/password" });
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as Body).code).toBe("PASSWORD_CHANGE_REQUIRED");
    const emails = await prisma.emailOutbox.findMany();
    expect(emails.map((email) => [email.to_address, email.template])).toEqual([["t1704-utente@example.test", "admin-password-reset"]]);
    expect(emails[0].text).not.toContain(TEMPORARY_PASSWORD);

    // Il cambio password dalla rotta ammessa azzera il flag: le API tornano disponibili.
    const changed = await callRoute(patchAuthConfig, {
      method: "PATCH",
      url: "/api/auth/config",
      body: { currentPassword: TEMPORARY_PASSWORD, newPassword: "nuova-password-1704", confirmPassword: "nuova-password-1704" },
      cookie: newCookie,
    });
    const renewedCookie = (changed.headers.get("set-cookie") ?? "").split(";")[0];
    expect(changed.status).toBe(200);
    expect((await createProjectWith(renewedCookie, subscriber.workspaceId)).status).toBe(201);
  });
});

describe("azioni del root admin", () => {
  // covers: AC-1704-3
  it("sospensione, cambio di ruolo, eliminazione e branding scrivono una riga ciascuno; un 403 non scrive nulla", async () => {
    const root = await createUserWithSession({ displayName: "t1704-root", role: UserRole.ADMIN, isRootAdmin: true });
    const admin = await createUserWithSession({ displayName: "t1704-admin", role: UserRole.ADMIN });
    const otherAdmin = await createUserWithSession({ displayName: "t1704-admin-due", role: UserRole.ADMIN });
    const [suspended, promoted, removed] = await Promise.all(
      ["sospeso", "promosso", "eliminato"].map((name) => createUserWithSession({ displayName: `t1704-${name}` }))
    );

    const responses = [
      await patchUser(suspended.user.id, root.cookie, { status: "SUSPENDED" }),
      await patchUser(promoted.user.id, root.cookie, { role: "ADMIN" }),
      await callRoute(deleteAdminUser, {
        method: "DELETE",
        url: `/api/admin/users/${removed.user.id}`,
        cookie: root.cookie,
        params: { id: removed.user.id },
      }),
      await callRoute(patchBranding, { method: "PATCH", url: "/api/settings/branding", body: { appName: "Marchio 1704" }, cookie: root.cookie }),
    ];
    const forbidden = await patchUser(otherAdmin.user.id, admin.cookie, { status: "SUSPENDED" });

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
    expect(forbidden.status).toBe(403);
    const rows = await prisma.adminAuditLog.findMany({ orderBy: { created_at: "asc" } });
    expect(rows.map((row) => row.action).sort()).toEqual(["branding.update", "user.delete", "user.role_change", "user.suspend"]);
    expect(rows.every((row) => row.actor_user_id === root.user.id)).toBe(true);
    const branding = rows.find((row) => row.action === "branding.update");
    expect(branding?.metadata).toEqual({ appName: { before: null, after: "Marchio 1704" } });
  });
});

describe("lettura del registro", () => {
  // covers: AC-1704-4
  it("l'admin non root riceve 403; il root admin 50 righe dalla più recente e il cursore della pagina successiva", async () => {
    const root = await createUserWithSession({ displayName: "t1704-root", role: UserRole.ADMIN, isRootAdmin: true });
    const admin = await createUserWithSession({ displayName: "t1704-admin", role: UserRole.ADMIN });
    const base = Date.UTC(2026, 9, 1);
    await prisma.adminAuditLog.createMany({
      data: Array.from({ length: 60 }, (_, index) => ({
        actor_user_id: root.user.id,
        action: "user.suspend",
        target_type: "user",
        target_id: `utente-${index}`,
        metadata: {},
        created_at: new Date(base + index * 60_000),
      })),
    });

    const denied = await callRoute(readAuditLog, { url: "/api/admin/audit-log", cookie: admin.cookie });
    const first = await callRoute(readAuditLog, { url: "/api/admin/audit-log", cookie: root.cookie });
    const firstPage = (await first.json()) as Body;
    const second = await callRoute(readAuditLog, {
      url: `/api/admin/audit-log?cursor=${encodeURIComponent(firstPage.meta?.nextCursor ?? "")}`,
      cookie: root.cookie,
    });
    const secondPage = (await second.json()) as Body;

    expect(denied.status).toBe(403);
    expect(first.status).toBe(200);
    const times = (firstPage.data ?? []).map((row) => Date.parse(row.createdAt));
    expect(times).toHaveLength(50);
    expect(times[0]).toBe(base + 59 * 60_000);
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(firstPage.meta?.nextCursor).toEqual(expect.any(String));
    expect(secondPage.data).toHaveLength(10);
    expect(secondPage.meta?.nextCursor).toBeNull();
  });
});
