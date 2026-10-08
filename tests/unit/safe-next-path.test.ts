// Gate di T-303 (AC-303-1…AC-303-3): dopo login e registrazione solo percorsi della stessa origine.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import LoginPage from "@/app/login/page";
import RegisterPage from "@/app/register/page";
import { LoginForm } from "@/components/login-form";
import { RegisterForm } from "@/components/register-form";
import { safeNextPath } from "@/lib/auth/safe-next-path";

// Dopo T-302 le pagine leggono l'utente dai cookie: qui l'utente è anonimo.
vi.mock("@/lib/auth/current-user", () => ({
  getOptionalAuthenticatedUserFromCookies: async () => null,
}));

// impacted-by: T-1302 (le pagine leggono i testi con getTranslations: fuori da Next, il catalogo italiano)
vi.mock("next-intl/server", () => import("../helpers/next-intl-server"));

// impacted-by: T-1606 (la registrazione pubblica è aperta solo con il lancio commerciale attivo, letto dal DB)
vi.mock("@/lib/billing/launch", () => ({ isCommercialLive: async () => true }));

const FILES_USING_NEXT = [
  "app/login/page.tsx",
  "app/register/page.tsx",
  "components/login-form.tsx",
  "components/register-form.tsx",
];

function findElement(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement<Record<string, unknown>>(node)) {
    return null;
  }
  if (node.type === type) {
    return node;
  }
  return findElement(node.props.children as ReactNode, type);
}

describe("safeNextPath", () => {
  // covers: AC-303-1
  it("restituisce / per destinazioni esterne, ambigue, non stringa o troppo lunghe", () => {
    const inputs: unknown[] = [
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "",
      undefined,
      42,
      "/" + "a".repeat(2048),
    ];

    for (const input of inputs) {
      expect(safeNextPath(input)).toBe("/");
    }
  });

  // covers: AC-303-2
  it("restituisce identici i percorsi della stessa origine", () => {
    for (const input of ["/", "/projects/abc/results?view=all&page=2", "/onboarding/run"]) {
      expect(safeNextPath(input)).toBe(input);
    }
  });
});

describe("pagine e form di login e registrazione", () => {
  // covers: AC-303-3
  it("con next=//evil.com i form ricevono / e i quattro file usano solo safeNextPath", async () => {
    vi.stubEnv("APP_PUBLIC_SIGNUP_ENABLED", "true");
    const searchParams = () => Promise.resolve({ next: "//evil.com" });

    const loginForm = findElement(await LoginPage({ searchParams: searchParams() }), LoginForm);
    const registerForm = findElement(await RegisterPage({ searchParams: searchParams() }), RegisterForm);
    vi.unstubAllEnvs();

    expect(loginForm?.props.nextPath).toBe("/");
    expect(registerForm?.props.nextPath).toBe("/");

    for (const file of FILES_USING_NEXT) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).toMatch(/import\s*\{[^}]*\bsafeNextPath\b[^}]*\}\s*from\s*"@\/lib\/auth\/safe-next-path"/);
      expect(source).not.toContain("startsWith(");
    }
  });
});
