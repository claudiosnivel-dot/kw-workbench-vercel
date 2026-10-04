// Gate di T-603 (AC-603-1…AC-603-4): health check pubblico, senza dettagli, con timeout breve.
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";
import { prisma } from "@/lib/prisma";
import { proxy } from "@/proxy";

type HealthBody = { status: string; db: string; version: string };

function healthRequest(): NextRequest {
  return new NextRequest(new URL("/api/health", "http://localhost:3000"));
}

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/health con il DB raggiungibile", () => {
  // covers: AC-603-1
  it("passa dal proxy senza sessione e risponde 200 ok con version e Cache-Control no-store", async () => {
    const passed = await proxy(healthRequest());
    expect(passed.status).not.toBe(401);
    expect(passed.headers.get("x-middleware-next")).toBe("1");

    const response = await GET();
    const body = (await response.json()) as HealthBody;

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.db).toBe("ok");
    expect(typeof body.version).toBe("string");
    expect(body.version).not.toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  // covers: AC-603-4
  it("espone solo status, db e version, senza valori delle variabili d'ambiente", async () => {
    // Entrambe valorizzate dal setup d'integrazione e dalla configurazione di Vitest.
    const databaseUrl = process.env.DATABASE_URL ?? "";
    const sessionSecret = process.env.APP_SESSION_SECRET ?? "";
    expect(databaseUrl).not.toBe("");
    expect(sessionSecret).not.toBe("");

    const response = await GET();
    const body = (await response.json()) as Record<string, string>;

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["db", "status", "version"]);
    for (const value of Object.values(body)) {
      expect(value).not.toContain(databaseUrl);
      expect(value).not.toContain(sessionSecret);
    }
  });
});

describe("GET /api/health con il DB in errore", () => {
  // covers: AC-603-2
  it("risponde 503 degraded senza il messaggio dell'errore", async () => {
    vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("connect ECONNREFUSED db.internal:5432"));
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const response = await GET();
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(text)).toMatchObject({ status: "degraded", db: "error" });
    expect(text).not.toContain("ECONNREFUSED");
    expect(text).not.toContain("db.internal");
  });

  // covers: AC-603-3
  it("risponde 503 entro 3 s quando la query non risponde per 10 s", async () => {
    vi.spyOn(prisma, "$queryRaw").mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([{ ok: 1 }]), 10_000)) as never
    );
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const startedAt = Date.now();
    const response = await GET();
    const elapsed = Date.now() - startedAt;

    expect(response.status).toBe(503);
    expect(elapsed).toBeLessThan(3000);
  });
});
