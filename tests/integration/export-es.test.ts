// Gate di T-4801 (AC-4801-1): export dei risultati in Excel con le intestazioni del catalogo es-ES per un utente con
// lingua es-ES; export della strategia con i testi spagnoli per un utente con lingua es-419 (DoD di T-4801).
import ExcelJS from "exceljs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as exportProject } from "@/app/api/projects/[id]/export/route";
import { GET as exportStrategy } from "@/app/api/projects/[id]/strategies/[strategyId]/export/route";
import { EXPORT_COLUMNS } from "@/lib/modules/export";
import { STRATEGY_EXPORT_COLUMNS } from "@/lib/modules/strategy/export";
import { prisma } from "@/lib/prisma";
import { createUserWithSession } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { callRoute } from "../helpers/http";
import { insertStrategy } from "../helpers/strategy";

async function workbookOf(response: Response): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  return workbook;
}

function headerOf(sheet: ExcelJS.Worksheet): string[] {
  return (sheet.getRow(1).values as unknown[]).slice(1) as string[];
}

beforeAll(() => {
  vi.stubEnv("APP_AUTH_ENABLED", "true");
});

beforeEach(async () => {
  await resetDatabase();
});

describe("export dei risultati in spagnolo (T-4801)", () => {
  // covers: AC-4801-1
  it("con la lingua es-ES l'Excel delle 3 keyword tenute ha «Palabra clave» e il volumen de búsqueda nelle intestazioni", async () => {
    const owner = await createUserWithSession({ displayName: "export-es" });
    await prisma.user.update({ where: { id: owner.user.id }, data: { ui_locale: "es_ES" } });
    const project = await prisma.project.create({ data: { name: "Zapatillas", workspace_id: owner.workspaceId } });
    const section = await prisma.subproject.create({ data: { project_id: project.id, name: "Running", position: 0 } });
    const base = { project_id: project.id, subproject_id: section.id, source: "seed", source_query: "zapatillas" };
    const keyword = (text: string, extra: object = {}) => ({ ...base, keyword: text, normalized_keyword: text, canonical_keyword: text, ...extra });
    await prisma.keywordCandidate.createMany({
      data: [
        keyword("zapatillas running", { avg_monthly_searches: 9900 }),
        keyword("zapatillas trail", { avg_monthly_searches: 2400 }),
        keyword("mejores zapatillas running"),
        keyword("zapatillas usadas", { review_status: "rejected" }),
      ],
    });

    const response = await callRoute(exportProject, {
      url: `/api/projects/${project.id}/export?format=xlsx&scope=kept`,
      cookie: owner.cookie,
      params: { id: project.id },
    });
    const sheet = (await workbookOf(response)).worksheets[0];
    const header = headerOf(sheet);

    expect(response.status).toBe(200);
    expect(sheet.actualRowCount).toBe(4);
    expect(header[EXPORT_COLUMNS.indexOf("keyword")]).toBe("Palabra clave");
    expect(header[EXPORT_COLUMNS.indexOf("avg_monthly_searches")].toLowerCase()).toContain("volumen de búsqueda");
    expect(header[0]).toBe("Tema");
    expect(sheet.name).toBe("Palabras clave");
  });
});

describe("export della strategia in spagnolo (DoD di T-4801)", () => {
  it("con la lingua es-419 l'Excel della strategia ha foglio, intestazioni, tipo di pagina e stato in spagnolo", async () => {
    const owner = await createUserWithSession({ displayName: "strategy-es" });
    await prisma.user.update({ where: { id: owner.user.id }, data: { ui_locale: "es_419" } });
    const project = await prisma.project.create({ data: { name: "Tenis", workspace_id: owner.workspaceId } });
    const { strategyId } = await insertStrategy({
      projectId: project.id,
      pages: [
        { key: "hub", kind: "HUB", h1: "Tenis para correr: guía práctica", h2: [], keywords: [{ text: "tenis para correr", volume: 9900 }] },
      ],
    });

    const response = await callRoute(exportStrategy, {
      url: `/api/projects/${project.id}/strategies/${strategyId}/export?format=xlsx`,
      cookie: owner.cookie,
      params: { id: project.id, strategyId },
    });
    const sheet = (await workbookOf(response)).worksheets[0];
    const header = headerOf(sheet);
    const row = (sheet.getRow(2).values as unknown[]).slice(1);

    expect(response.status).toBe(200);
    expect(sheet.name).toBe("Estrategia");
    expect(header).toHaveLength(STRATEGY_EXPORT_COLUMNS.length);
    expect(header[STRATEGY_EXPORT_COLUMNS.indexOf("page_type")]).toBe("Tipo de página");
    expect(header[STRATEGY_EXPORT_COLUMNS.indexOf("main_keyword")]).toBe("Palabra clave principal");
    expect(row[STRATEGY_EXPORT_COLUMNS.indexOf("page_type")]).toBe("Página pilar");
    expect(row[STRATEGY_EXPORT_COLUMNS.indexOf("status")]).toBe("Por escribir");
  });
});
