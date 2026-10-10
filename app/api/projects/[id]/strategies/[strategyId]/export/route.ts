import type { NextRequest } from "next/server";
import { getLocale } from "next-intl/server";
import { requireProjectAccess } from "@/lib/authz/workspace";
import { errorResponse } from "@/lib/http/errors";
import { type StrategyParams, withUserRoute } from "@/lib/http/user-route";
import { isSupportedLocale } from "@/lib/i18n/locale";
import { CSV_DIALECT_DEFAULT, isCsvDialect } from "@/lib/modules/export";
import { STRATEGY_DOWNLOAD_FORMATS, type StrategyDownloadFormat, strategyDownload } from "@/lib/modules/strategy/download";
import { readStrategy } from "@/lib/modules/strategy/service";

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_FORMATS = new Set<string>(STRATEGY_DOWNLOAD_FORMATS);

/**
 * Export della strategia (T-1906, T-1907): format csv (dialetto excel-it o rfc4180), xlsx o pdf; per il PDF lang it o
 * en, di default la lingua dell'interfaccia. Progetto fuori dal workspace: 404 prima di leggere la strategia.
 */
export const GET = withUserRoute(async (request: NextRequest, user, { id, strategyId }: StrategyParams) => {
  const format = request.nextUrl.searchParams.get("format") ?? "csv";
  const csvDialect = request.nextUrl.searchParams.get("csvDialect") ?? CSV_DIALECT_DEFAULT;
  const lang = request.nextUrl.searchParams.get("lang");

  if (!VALID_FORMATS.has(format)) {
    return errorResponse(400, "EXPORT_FORMAT_INVALID", "Formato non valido");
  }
  if (!isCsvDialect(csvDialect)) {
    return errorResponse(400, "EXPORT_DIALECT_INVALID", "Dialetto CSV non valido: usa excel-it o rfc4180");
  }

  const project = await requireProjectAccess(user, id, "export.run", { name: true });
  const strategy = await readStrategy(project.id, strategyId);
  return strategyDownload({
    project,
    strategy,
    format: format as StrategyDownloadFormat,
    csvDialect,
    locale: isSupportedLocale(lang) ? lang : await getLocale(),
  });
});
