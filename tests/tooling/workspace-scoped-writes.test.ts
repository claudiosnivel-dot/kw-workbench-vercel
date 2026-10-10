// Gate di T-1502 (AC-1502-4): nessuna scrittura di Prisma su project, subproject, seed, keywordCandidate e job in app/**
// e lib/** ha un where composto dal solo id. Ogni update e delete porta il perimetro del workspace (workspace_id,
// filtro project o perimetro dell'autorizzazione) o una condizione di stato del runner dei job.
// impacted-by: T-1903 (la regola vale anche per strategy, strategyPage e strategyKeyword)
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SCOPED_MODELS = new Set([
  "project",
  "subproject",
  "seed",
  "keywordCandidate",
  "job",
  "strategy",
  "strategyPage",
  "strategyKeyword",
]);
const WRITE_METHODS = new Set(["update", "delete", "updateMany", "deleteMany"]);
const ROOTS = ["app", "lib"];
const EXCLUDED_DIRS = new Set(["generated", "node_modules"]);

type WriteCall = { location: string; model: string; method: string; where: "id-only" | "other" | "unresolved" };

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return EXCLUDED_DIRS.has(entry.name) ? [] : sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

function propertyName(property: ts.ObjectLiteralElementLike): string | null {
  if ((ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) && property.name) {
    return ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : null;
  }
  return null;
}

/** Oggetto letterale del where: direttamente, o tramite una variabile const dichiarata nello stesso file. */
function resolveObject(expression: ts.Expression, file: ts.SourceFile): ts.ObjectLiteralExpression | null {
  if (ts.isObjectLiteralExpression(expression)) {
    return expression;
  }
  if (!ts.isIdentifier(expression)) {
    return null;
  }
  let found: ts.ObjectLiteralExpression | null = null;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === expression.text) {
      found = node.initializer && ts.isObjectLiteralExpression(node.initializer) ? node.initializer : null;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function classifyWhere(call: ts.CallExpression, file: ts.SourceFile): WriteCall["where"] {
  const args = call.arguments[0] ? resolveObject(call.arguments[0], file) : null;
  const whereProperty = args?.properties.find((property) => propertyName(property) === "where");
  if (!whereProperty) {
    return "unresolved";
  }
  const whereExpression = ts.isShorthandPropertyAssignment(whereProperty)
    ? whereProperty.name
    : ts.isPropertyAssignment(whereProperty)
      ? whereProperty.initializer
      : null;
  const where = whereExpression ? resolveObject(whereExpression, file) : null;
  if (!where) {
    return "unresolved";
  }
  const names = where.properties.map(propertyName);
  return names.length === 1 && names[0] === "id" ? "id-only" : "other";
}

/** Chiamate <client>.<modello>.<metodo>(...) di scrittura sui modelli del perimetro del workspace. */
function findScopedWrites(fileName: string, source: string): WriteCall[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const calls: WriteCall[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isPropertyAccessExpression(node.expression.expression)
    ) {
      const method = node.expression.name.text;
      const model = node.expression.expression.name.text;
      if (SCOPED_MODELS.has(model) && WRITE_METHODS.has(method)) {
        const { line } = file.getLineAndCharacterOfPosition(node.getStart());
        calls.push({ location: `${fileName}:${line + 1}`, model, method, where: classifyWhere(node, file) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return calls;
}

describe("scritture con il perimetro del workspace", () => {
  it("l'analisi riconosce un where composto dal solo id (controllo positivo)", () => {
    const calls = findScopedWrites(
      "esempio.ts",
      `async function f(id: string, scope: object) {
        await prisma.project.update({ where: { id }, data: {} });
        const where = { id: id };
        await tx.subproject.deleteMany({ where });
        await prisma.job.updateMany({ where: { id, status: "pending" }, data: {} });
        await prisma.seed.deleteMany({ where: { id, project: scope }, data: {} });
        await db.keywordCandidate.updateMany(args);
      }`
    );
    expect(calls.map((call) => call.where)).toEqual(["id-only", "id-only", "other", "other", "unresolved"]);
  });

  // covers: AC-1502-4
  it("in app/** e lib/** nessuna scrittura ha un where composto dal solo id, e ogni where è analizzabile", () => {
    const calls = ROOTS.flatMap((root) =>
      sourceFiles(root).flatMap((file) => findScopedWrites(file.split(path.sep).join("/"), readFileSync(file, "utf8")))
    );

    expect(calls.length).toBeGreaterThan(10);
    expect(calls.filter((call) => call.where === "id-only")).toEqual([]);
    expect(calls.filter((call) => call.where === "unresolved")).toEqual([]);
  });
});
