import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { parsePlannerCsv } from "@/lib/modules/planner/csv-parser";
import { applyPlannerImport, PLANNER_IMPORT_MAX_ROWS } from "@/lib/modules/planner/import";
import { PLANNER_IMPORT_EXTENSIONS, PLANNER_IMPORT_MAX_BYTES } from "@/lib/modules/planner/import-limits";
import { resolvePlannerScope } from "@/lib/modules/planner/scope";

export const runtime = "nodejs";

// Margine per intestazioni e delimitatori del multipart oltre al file.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const MAX_BODY_BYTES = PLANNER_IMPORT_MAX_BYTES + MULTIPART_OVERHEAD_BYTES;

type RouteContext = {
  params: Promise<{ id: string }>;
};

const tooLarge = () =>
  NextResponse.json({ error: "File troppo grande: il massimo è 5 MB", code: "FILE_TOO_LARGE" }, { status: 413 });

/** Corpo della richiesta letto fino al limite (CWE-400): null appena lo supera, senza leggere il resto. */
async function readBodyWithin(request: NextRequest, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const next = await reader?.read();
    if (!next || next.done) {
      break;
    }
    total += next.value.byteLength;
    if (total > limit) {
      await reader?.cancel();
      return null;
    }
    chunks.push(next.value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/**
 * Import dei volumi dal file di Keyword Planner (T-910): multipart con il campo `file` e `sectionId` facoltativo.
 * Progetto e sezione filtrati per proprietario (404 agli altri, CWE-639); massimo 5 MB verificato sul
 * Content-Length e sui byte letti; il file resta in memoria e non viene salvato.
 */
export const POST = withApiErrors(async (request: NextRequest, context: RouteContext) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { id } = await context.params;

  const owned = await resolvePlannerScope({ projectId: id, ownerUserId: user.id });
  if ("notFound" in owned) {
    return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return tooLarge();
  }
  const body = await readBodyWithin(request, MAX_BODY_BYTES);
  if (!body) {
    return tooLarge();
  }

  const form = await new Response(body, {
    headers: { "content-type": request.headers.get("content-type") ?? "" },
  })
    .formData()
    .catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Allega il file scaricato da Keyword Planner nel campo file" }, { status: 400 });
  }
  if (file.size > PLANNER_IMPORT_MAX_BYTES) {
    return tooLarge();
  }
  if (!PLANNER_IMPORT_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension))) {
    return NextResponse.json({ error: "Formato non ammesso: carica un file .csv o .tsv" }, { status: 400 });
  }

  const rawSectionId = form?.get("sectionId");
  const sectionId = typeof rawSectionId === "string" && rawSectionId.trim() ? rawSectionId.trim() : null;
  if (sectionId && !owned.sections.some((section) => section.id === sectionId)) {
    return NextResponse.json({ error: "Sezione non trovata" }, { status: 404 });
  }

  let parsed;
  try {
    parsed = parsePlannerCsv(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: "File non riconosciuto: manca la colonna Keyword" }, { status: 400 });
  }
  if (parsed.rows.length > PLANNER_IMPORT_MAX_ROWS) {
    return NextResponse.json({ error: `Troppe righe: il massimo è ${PLANNER_IMPORT_MAX_ROWS}` }, { status: 413 });
  }

  const summary = await applyPlannerImport(id, sectionId, parsed.rows);
  return NextResponse.json({ data: { ...summary, skippedRows: parsed.skippedRows } });
});
