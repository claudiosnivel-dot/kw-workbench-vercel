import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/authz/workspace";
import { assertFeature } from "@/lib/billing/enforce";
import { AppError, errorResponse } from "@/lib/http/errors";
import { type StrategyParams, withUserRoute } from "@/lib/http/user-route";
import { exportTableToGoogleSheets, GoogleReauthRequiredError, GoogleSheetsExportError } from "@/lib/modules/google-sheets-export";
import { STRATEGY_EXPORT_COLUMNS, strategyExportRows } from "@/lib/modules/strategy/export";
import { readStrategy } from "@/lib/modules/strategy/service";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Export della strategia su Google Sheets (T-1906): flusso OAuth, scope e protezioni dell'export dei risultati
 * (T-806, T-906), foglio «strategia» con le colonne dell'export CSV.
 */
export const POST = withUserRoute(async (request: Request, user, { id, strategyId }: StrategyParams) => {
  const payload = (await request.json()) as { fileName?: unknown };
  const fileName = String(payload.fileName ?? "").trim();
  if (!fileName) {
    return errorResponse(400, "SHEETS_FILE_NAME_REQUIRED", "Nome file obbligatorio");
  }

  const project = await requireProjectAccess(user, id, "export.run", {});
  // Export su Google Sheets nel piano del workspace (T-1605): senza il diritto 402, nessuna chiamata a Google.
  await assertFeature(project.workspace_id, "sheetsExport");
  const strategy = await readStrategy(project.id, strategyId);

  try {
    const data = await exportTableToGoogleSheets({
      userId: user.id,
      fileName,
      sheetTitle: "strategia",
      columns: STRATEGY_EXPORT_COLUMNS,
      rows: strategyExportRows(strategy),
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
