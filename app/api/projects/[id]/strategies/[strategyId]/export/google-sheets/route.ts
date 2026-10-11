import { type NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz/workspace";
import { assertFeature } from "@/lib/billing/enforce";
import { AppError, errorResponse } from "@/lib/http/errors";
import { type StrategyParams, withUserRoute } from "@/lib/http/user-route";
import { routeLocale } from "@/lib/i18n/route-locale";
import { exportTableToGoogleSheets, GoogleReauthRequiredError, GoogleSheetsExportError } from "@/lib/modules/google-sheets-export";
import { strategyExportTable } from "@/lib/modules/strategy/export";
import { readStrategy } from "@/lib/modules/strategy/service";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Export della strategia su Google Sheets (T-1906): flusso OAuth, scope e protezioni dell'export dei risultati
 * (T-806, T-906), un foglio con le righe dell'export CSV. Nome del foglio, intestazioni ed etichette nella lingua lang
 * (it o en) della query, di default la lingua dell'interfaccia, come l'export su file (T-2102).
 */
export const POST = withUserRoute(async (request: NextRequest, user, { id, strategyId }: StrategyParams) => {
  const payload = (await request.json()) as { fileName?: unknown };
  const fileName = String(payload.fileName ?? "").trim();
  if (!fileName) {
    return errorResponse(400, "SHEETS_FILE_NAME_REQUIRED", "Nome file obbligatorio");
  }

  const project = await requireProjectAccess(user, id, "export.run", {});
  // Export su Google Sheets nel piano del workspace (T-1605): senza il diritto 402, nessuna chiamata a Google.
  await assertFeature(project.workspace_id, "sheetsExport");
  const strategy = await readStrategy(project.id, strategyId);
  const table = strategyExportTable(strategy, routeLocale(request, user, request.nextUrl.searchParams.get("lang")));

  try {
    const data = await exportTableToGoogleSheets({
      userId: user.id,
      fileName,
      sheetTitle: table.sheet,
      columns: table.columns,
      rows: table.rows,
    });
    return NextResponse.json({ data });
  } catch (error) {
    // Errori di Google con status e messaggio pubblici; ogni altra eccezione resta nei log (CWE-209).
    if (error instanceof GoogleSheetsExportError || error instanceof GoogleReauthRequiredError) {
      throw error;
    }
    logger.error("strategy_sheets_export_failed", { projectId: id, strategyId, error });
    throw new AppError(500, "INTERNAL_ERROR", "Errore interno durante l'export su Google Sheets");
  }
});
