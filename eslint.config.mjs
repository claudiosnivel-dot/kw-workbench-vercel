import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

// Regole di eslint-config-next 15.5.x (stessa versione di next), in formato flat
// tramite FlatCompat: la config di Next 15 è ancora in formato eslintrc.
const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "tests/fixtures/tooling/**",
      "next-env.d.ts",
      // Client Prisma generato da prisma generate (T-403).
      "lib/generated/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Regola ristretta: i parametri con prefisso _ sono ignorati. I provider di
      // metriche (MockMetricsProvider, NoMetricsProvider) implementano la firma
      // enrichKeywords(keywords, _context) dell'interfaccia senza usare il contesto.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];

export default eslintConfig;
