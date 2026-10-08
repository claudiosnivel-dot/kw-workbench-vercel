// Gate di T-505 (AC-505-4): script-src con nonce e strict-dynamic, unsafe-eval solo in sviluppo.
import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/security/csp";

function directive(csp: string, name: string): string[] {
  const entry = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.split(/\s+/)[0] === name);
  return entry ? entry.split(/\s+/).slice(1) : [];
}

describe("buildCsp", () => {
  // covers: AC-505-4
  it("in produzione script-src ha nonce e strict-dynamic senza unsafe-eval né unsafe-inline; in sviluppo anche unsafe-eval", () => {
    const production = directive(buildCsp("abc", false), "script-src");
    const development = directive(buildCsp("abc", true), "script-src");

    expect(production).toContain("'nonce-abc'");
    expect(production).toContain("'strict-dynamic'");
    expect(production).not.toContain("'unsafe-eval'");
    expect(production).not.toContain("'unsafe-inline'");
    expect(development).toContain("'nonce-abc'");
    expect(development).toContain("'unsafe-eval'");
  });

  it("vieta frame, oggetti e base esterni e ammette i logo https", () => {
    const csp = buildCsp("abc", false);

    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
    expect(directive(csp, "img-src")).toEqual(["'self'", "blob:", "data:", "https:"]);
    expect(directive(csp, "style-src")).toEqual(["'self'", "'nonce-abc'"]);
  });

  it("con il DSN di Sentry connect-src ammette l'host di ingest e senza DSN solo self (T-601)", () => {
    expect(directive(buildCsp("abc", false), "connect-src")).toEqual(["'self'"]);
    expect(directive(buildCsp("abc", false, "https://chiave@o1.ingest.de.sentry.io/2"), "connect-src")).toEqual([
      "'self'",
      "https://o1.ingest.de.sentry.io",
    ]);
    expect(directive(buildCsp("abc", false, "non-un-url"), "connect-src")).toEqual(["'self'"]);
  });

  it("con PADDLE_ENV ammette l'iframe e gli stili del checkout di quell'ambiente, senza cambiare script-src (T-1602)", () => {
    const sandbox = buildCsp("abc", false, undefined, "sandbox");
    const production = buildCsp("abc", false, undefined, "production");

    expect(directive(sandbox, "frame-src")).toEqual(["'self'", "https://sandbox-buy.paddle.com"]);
    expect(directive(production, "frame-src")).toEqual(["'self'", "https://buy.paddle.com"]);
    expect(directive(production, "style-src")).toEqual(["'self'", "'nonce-abc'", "https://cdn.paddle.com"]);
    expect(directive(sandbox, "script-src")).toEqual(directive(buildCsp("abc", false), "script-src"));
    expect(directive(buildCsp("abc", false, undefined, "altro"), "frame-src")).toEqual([]);
  });
});
