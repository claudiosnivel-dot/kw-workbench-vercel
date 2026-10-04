import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Regole di eslint-config-next 16.3.x (stessa versione di next), già in formato flat:
// con Next 16 FlatCompat non serve più (T-404).
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "tests/fixtures/tooling/**",
    "next-env.d.ts",
    // Client Prisma generato da prisma generate (T-403).
    "lib/generated/**",
  ]),
  {
    rules: {
      // Regola ristretta: i parametri con prefisso _ sono ignorati. I provider di
      // metriche (MockMetricsProvider, NoMetricsProvider) implementano la firma
      // enrichKeywords(keywords, _context) dell'interfaccia senza usare il contesto.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      // Regole nuove di eslint-config-next 16 (react-hooks 7 e @next/next), assenti nel set di
      // T-102: segnalano setState negli effect (admin-users-dashboard, top-nav) e
      // window.location.assign nell'onboarding. Correggerle cambia il comportamento dei componenti,
      // fuori dallo scope dell'upgrade (T-402/T-404: le regole restano quelle di T-102).
      "react-hooks/set-state-in-effect": "off",
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
]);

export default eslintConfig;
