import { describe, expect, it } from "vitest";
import { assertLocalTestDatabase } from "../helpers/db-guard";

describe("assertLocalTestDatabase", () => {
  // covers: AC-101-2
  it("rifiuta un host remoto nominando l'host e mai la password", () => {
    const remote = "postgresql://u:pw-segreta@db.example.supabase.co:5432/postgres";

    let message = "";
    try {
      assertLocalTestDatabase(remote);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("db.example.supabase.co");
    expect(message).not.toContain("pw-segreta");
  });

  // covers: AC-101-2
  it("rifiuta un TEST_DATABASE_URL non impostato nominando la variabile", () => {
    expect(() => assertLocalTestDatabase(undefined)).toThrow(/TEST_DATABASE_URL/);
  });

  // covers: AC-101-2
  it("accetta il Postgres di test su localhost", () => {
    expect(() =>
      assertLocalTestDatabase("postgresql://postgres:postgres@localhost:54329/kw_workbench_test")
    ).not.toThrow();
  });

  it("accetta 127.0.0.1 e ::1 come host locali", () => {
    expect(() =>
      assertLocalTestDatabase("postgresql://postgres:postgres@127.0.0.1:54329/kw_workbench_test")
    ).not.toThrow();
    expect(() =>
      assertLocalTestDatabase("postgresql://postgres:postgres@[::1]:54329/kw_workbench_test")
    ).not.toThrow();
  });
});
