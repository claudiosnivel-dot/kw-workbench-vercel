import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/** File con le stringhe visibili nei cataloghi (T-1302, T-1303): un testo cablato qui è una regressione. */
const I18N_MIGRATED_FILES = [
  // T-1302: autenticazione, navigazione, dashboard, progetti, sezioni, estrazione, risultati ed export.
  "app/login/page.tsx",
  "components/login-form.tsx",
  "app/register/page.tsx",
  "components/register-form.tsx",
  "components/logout-button.tsx",
  "components/top-nav.tsx",
  "components/locale-switcher.tsx",
  "app/page.tsx",
  "components/pagination-links.tsx",
  "app/projects/new/page.tsx",
  "components/project-form.tsx",
  "app/projects/[id]/page.tsx",
  "app/projects/[id]/sections/page.tsx",
  "app/projects/[id]/settings/page.tsx",
  "app/projects/[id]/subprojects/[subprojectId]/page.tsx",
  "components/subproject-form.tsx",
  // delete-entity-button.tsx sostituisce delete-project-button.tsx e delete-subproject-button.tsx (T-1102).
  "components/delete-entity-button.tsx",
  "components/section-order-buttons.tsx",
  "components/set-default-section-button.tsx",
  "components/run-extraction-button.tsx",
  "components/job-progress.tsx",
  "app/projects/[id]/results/page.tsx",
  "components/results-table.tsx",
  "components/google-sheets-export-button.tsx",
  "components/planner-export-download.tsx",
  "components/planner-import-upload.tsx",
  // T-1303: onboarding, impostazioni, admin, integrazioni e pagine d'errore. components/google-ads-integration-card.tsx
  // non esiste più (rimossa con T-901); onboarding-step-done.tsx e metrics-spend-card.tsx sono nate dopo il blueprint.
  "app/onboarding/layout.tsx",
  "app/onboarding/page.tsx",
  "app/onboarding/project-create/page.tsx",
  "app/onboarding/project-targeting/page.tsx",
  "app/onboarding/review-export/page.tsx",
  "app/onboarding/run/page.tsx",
  "app/onboarding/section-create/page.tsx",
  "app/onboarding/seeds/page.tsx",
  "app/onboarding/welcome/page.tsx",
  "components/onboarding-progress-header.tsx",
  "components/onboarding-project-create-form.tsx",
  "components/onboarding-project-targeting-form.tsx",
  "components/onboarding-section-create-form.tsx",
  "components/onboarding-seeds-form.tsx",
  "components/onboarding-run-step.tsx",
  "components/onboarding-review-export-step.tsx",
  "components/onboarding-welcome-actions.tsx",
  "components/onboarding-step-done.tsx",
  "components/resume-onboarding-button.tsx",
  "app/personalizza/page.tsx",
  "components/personalization-settings-card.tsx",
  "components/auth-settings-card.tsx",
  "components/branding-settings-card.tsx",
  "app/admin/page.tsx",
  "components/admin-users-dashboard.tsx",
  "components/metrics-spend-card.tsx",
  "components/google-sheets-api-config-card.tsx",
  "components/google-sheets-personal-card.tsx",
  "app/error.tsx",
  "app/not-found.tsx",
];

// Attributi JSX con testo per l'utente.
const TEXT_ATTRIBUTES = new Set(["placeholder", "title", "aria-label", "alt", "label", "runningLabel"]);
// Setter di messaggi per l'utente: anche i loro argomenti devono arrivare dal catalogo.
const MESSAGE_SETTERS = new Set(["setError", "setSuccess"]);
// Token non traducibili, ammessi come testo JSX intero: formati di file e nomi di prodotto.
const ALLOWED_TOKENS = new Set(["CSV", "XLSX", "JSON", "Google Sheets"]);
const HAS_LETTER = /\p{L}/u;

type Violation = { file: string; line: number; text: string };

/** Funzione di traduzione: t, tCommon, tFields... (convenzione dei componenti migrati). */
function isTranslatorCall(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)
      ? callee.expression.text
      : "";
  return /^t(?:[A-Z]\w*)?$/.test(name);
}

function isStringNode(node: ts.Node): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node);
}

function literalText(node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression): string {
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" ");
  }
  return node.text;
}

/** Analizza un file TSX e restituisce i testi cablati con la loro riga. */
function findHardcodedStrings(file: string, source: string): Violation[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: Violation[] = [];
  const report = (node: ts.Node, text: string) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push({ file, line: line + 1, text: text.trim() });
  };

  /** Stringhe con lettere dentro un'espressione, escluse le chiavi passate alla funzione di traduzione. */
  const visitExpression = (node: ts.Node) => {
    if (isTranslatorCall(node)) return;
    if (isStringNode(node)) {
      const text = literalText(node);
      if (HAS_LETTER.test(text)) report(node, text);
    }
    ts.forEachChild(node, visitExpression);
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const text = node.text.trim();
      if (HAS_LETTER.test(text) && !ALLOWED_TOKENS.has(text)) report(node, text);
    } else if (ts.isJsxAttribute(node) && TEXT_ATTRIBUTES.has(node.name.getText(sourceFile))) {
      if (node.initializer) visitExpression(node.initializer);
      return;
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      MESSAGE_SETTERS.has(node.expression.text)
    ) {
      node.arguments.forEach(visitExpression);
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

const ROOT = process.cwd();

describe("nessuna stringa cablata nei file migrati", () => {
  // covers: AC-1302-3
  // covers: AC-1303-1
  it("i file di I18N_MIGRATED_FILES non hanno testi JSX, attributi o messaggi fuori dal catalogo", () => {
    const violations = I18N_MIGRATED_FILES.flatMap((file) =>
      findHardcodedStrings(file, readFileSync(join(ROOT, file), "utf8"))
    ).map((violation) => `${violation.file}:${violation.line} ${violation.text}`);

    expect(violations).toEqual([]);
  });

  // covers: AC-1302-3
  it("la fixture con un solo <p>Testo fisso</p> produce esattamente una violazione con file e riga", () => {
    const fixture = "tests/fixtures/i18n/hardcoded.tsx";
    const source = readFileSync(join(ROOT, fixture), "utf8");
    const expectedLine = source.split("\n").findIndex((line) => line.includes("Testo fisso")) + 1;

    expect(findHardcodedStrings(fixture, source)).toEqual([{ file: fixture, line: expectedLine, text: "Testo fisso" }]);
  });
});
