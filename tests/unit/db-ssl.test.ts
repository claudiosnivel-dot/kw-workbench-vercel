// T-403: TLS esplicito per il pool di pg (il vecchio engine usava sslmode=prefer).
import { X509Certificate } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SUPABASE_ROOT_CA_2021, sslForDatabaseUrl } from "@/lib/db/ssl";

describe("TLS del pool di pg", () => {
  it("nessun TLS sui DB locali di sviluppo, test e CI", () => {
    for (const host of ["localhost:54329", "127.0.0.1:5432", "[::1]:5432"]) {
      expect(sslForDatabaseUrl(`postgresql://postgres:postgres@${host}/kw`)).toBe(false);
    }
  });

  it("verifica completa con la CA di Supabase per pooler e connessione diretta", () => {
    for (const host of ["aws-0-eu-central-1.pooler.supabase.com:6543", "db.abcdefgh.supabase.co:5432"]) {
      expect(sslForDatabaseUrl(`postgresql://postgres.ref:pw@${host}/postgres?pgbouncer=true`)).toEqual({
        ca: SUPABASE_ROOT_CA_2021,
        rejectUnauthorized: true,
      });
    }
  });

  it("verifica completa con le CA di sistema per gli altri host remoti", () => {
    expect(sslForDatabaseUrl("postgresql://u:p@db.example.com:5432/app")).toEqual({ rejectUnauthorized: true });
  });

  it("la CA incorporata è la radice Supabase 2021 con l'impronta dichiarata", () => {
    const certificate = new X509Certificate(SUPABASE_ROOT_CA_2021);

    expect(certificate.subject).toContain("CN=Supabase Root 2021 CA");
    expect(certificate.fingerprint256).toBe(
      "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA"
    );
    expect(new Date(certificate.validTo).getTime()).toBeGreaterThan(Date.now());
  });
});
