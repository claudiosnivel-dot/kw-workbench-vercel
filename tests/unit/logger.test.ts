// Gate di T-602 (AC-602-1, AC-602-2): log JSON su una riga con redazione dei campi sensibili.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/lib/observability/logger";

let written: string[] = [];

beforeEach(() => {
  written = [];
  vi.stubEnv("LOG_LEVEL", "info");
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    written.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("logger.error", () => {
  // covers: AC-602-1
  it("scrive una sola riga JSON con password e nested.token redatti e lo stack dell'errore", () => {
    logger.error("login_failed", { username: "u", password: "segreto", nested: { token: "t1" }, err: new Error("boom") });

    const output = written.join("");
    const lines = output.split("\n").filter((line) => line !== "");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]) as {
      level: string;
      password: string;
      nested: { token: string };
      err: { stack: string };
    };
    expect(entry.level).toBe("error");
    expect(entry.password).toBe("[REDACTED]");
    expect(entry.nested.token).toBe("[REDACTED]");
    expect(entry.err.stack).not.toBe("");
    expect(typeof entry.err.stack).toBe("string");
    expect(output).not.toContain("segreto");
    expect(output).not.toContain("t1");
  });
});

describe("logger.warn", () => {
  // covers: AC-602-2
  it("tiene su una riga un messaggio con un ritorno a capo e una finta riga di log", () => {
    const forged = 'ok\n{"ts":"2026-10-05T00:00:00.000Z","level":"info","msg":"admin_login"}';

    logger.warn(forged);

    const output = written.join("");
    expect(output.match(/\n/g)).toHaveLength(1);
    expect(output.endsWith("\n")).toBe(true);
    expect(output).toContain(String.raw`ok\n{\"ts\"`);
    expect((JSON.parse(output) as { msg: string }).msg).toBe(forged);
  });
});
