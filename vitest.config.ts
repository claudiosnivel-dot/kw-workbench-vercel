import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

// Segreto di sessione fittizio, usato solo dai test: mai un valore reale.
const TEST_SESSION_SECRET = "vitest-session-secret-not-for-production-use";

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: rootDir }],
  },
  // Il JSX dei test si trasforma qui con il runtime automatico (lo stesso di jsx "react-jsx" in tsconfig.json).
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          include: ["tests/component/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["tests/component/setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          // Il DB di test è condiviso: i file non girano in parallelo.
          fileParallelism: false,
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          // URL pubblico dei link nelle email (T-1402): le email dei test finiscono nella tabella email_outbox.
          env: { APP_SESSION_SECRET: TEST_SESSION_SECRET, APP_PUBLIC_URL: "http://localhost:3000", EMAIL_TRANSPORT: "outbox" },
        },
      },
      {
        extends: true,
        test: {
          name: "tooling",
          include: ["tests/tooling/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});
