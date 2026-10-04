import { NextResponse } from "next/server";
import { MetricsProviderUnavailableError } from "@/lib/modules/project-settings";

/** Risposta 400 per un payload di impostazioni rifiutato (T-304); null per ogni altro errore. */
export function invalidSettingsResponse(error: unknown): NextResponse | null {
  return error instanceof MetricsProviderUnavailableError ? NextResponse.json(error.body, { status: 400 }) : null;
}
