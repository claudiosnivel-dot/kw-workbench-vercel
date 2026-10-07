// Gate di T-507 (AC-507-1…AC-507-3): totali nel perimetro dell'attore, paginazione stabile, azioni su se stessi rifiutate.
import { UserRole, UserStatus } from "@/lib/generated/prisma/enums";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as deleteAdminUser, PATCH as patchAdminUser } from "@/app/api/admin/users/[id]/route";
import { GET as listAdminUsers } from "@/app/api/admin/users/route";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";

type ListBody = {
  data: {
    users: Array<{ id: string; role: string }>;
    totals: Record<string, number | null>;
    page: number;
    pageSize: number;
    total: number;
  };
};

// Hash non verificabile: questi utenti non fanno login, servono solo a popolare la lista.
const UNUSABLE_HASH = "scrypt$non-usabile$non-usabile";

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await resetDatabase();
});

async function createSubscribers(count: number, prefix: string, status: UserStatus = UserStatus.ACTIVE) {
  await prisma.user.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      display_name: `${prefix}-${String(index).padStart(3, "0")}`,
      email: `${prefix}-${String(index).padStart(3, "0")}@example.test`,
      password_hash: UNUSABLE_HASH,
      role: UserRole.SUBSCRIBER,
      status,
    })),
  });
}

async function list(cookie: string, query = ""): Promise<ListBody["data"]> {
  const response = await callRoute(listAdminUsers, { url: `/api/admin/users${query}`, cookie });
  expect(response.status).toBe(200);
  return ((await response.json()) as ListBody).data;
}

describe("totali per un admin non root", () => {
  // covers: AC-507-1
  it("contano solo i sottoscrittori e totalAdmins è null", async () => {
    await createUserWithSession({ displayName: "root-507", role: UserRole.ADMIN, isRootAdmin: true });
    await createUserWithSession({ displayName: "admin-507-b", role: UserRole.ADMIN });
    const { cookie } = await createUserWithSession({ displayName: "admin-507-a", role: UserRole.ADMIN });
    await createSubscribers(4, "sub-attivo");
    await createSubscribers(1, "sub-sospeso", UserStatus.SUSPENDED);

    const data = await list(cookie);

    expect(data.totals).toEqual({
      totalUsers: 5,
      totalSubscribers: 5,
      totalAdmins: null,
      totalActive: 4,
      totalSuspended: 1,
    });
    expect(data.users.every((user) => user.role === UserRole.SUBSCRIBER)).toBe(true);
  });
});

describe("paginazione", () => {
  // covers: AC-507-2
  it("restituisce 50, 50 e 20 utenti senza ripetizioni e limita pageSize a 100", async () => {
    const { cookie } = await createUserWithSession({ displayName: "root-507", role: UserRole.ADMIN, isRootAdmin: true });
    await createSubscribers(119, "sub");

    const pages = [
      await list(cookie, "?page=1&pageSize=50"),
      await list(cookie, "?page=2&pageSize=50"),
      await list(cookie, "?page=3&pageSize=50"),
    ];
    const ids = pages.flatMap((page) => page.users.map((user) => user.id));

    expect(pages.map((page) => page.users.length)).toEqual([50, 50, 20]);
    expect(new Set(ids).size).toBe(120);
    expect(pages.every((page) => page.total === 120)).toBe(true);

    const capped = await list(cookie, "?page=1&pageSize=1000");
    expect(capped.pageSize).toBe(100);
    expect(capped.users).toHaveLength(100);
  });
});

describe("azioni dell'admin su se stesso", () => {
  // covers: AC-507-3
  it("sospensione ed eliminazione del proprio account rispondono 400 SELF_ACTION_FORBIDDEN e il record non cambia", async () => {
    const actors = [
      await createUserWithSession({ displayName: "root-507", role: UserRole.ADMIN, isRootAdmin: true }),
      await createUserWithSession({ displayName: "admin-507", role: UserRole.ADMIN }),
    ];

    for (const { user, cookie } of actors) {
      const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

      const suspend = await callRoute(patchAdminUser, {
        method: "PATCH",
        url: `/api/admin/users/${user.id}`,
        cookie,
        body: { status: UserStatus.SUSPENDED },
        params: { id: user.id },
      });
      const remove = await callRoute(deleteAdminUser, {
        method: "DELETE",
        url: `/api/admin/users/${user.id}`,
        cookie,
        params: { id: user.id },
      });

      for (const response of [suspend, remove]) {
        expect(response.status).toBe(400);
        expect(((await response.json()) as { code?: string }).code).toBe("SELF_ACTION_FORBIDDEN");
      }
      expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(before);
    }
  });
});
