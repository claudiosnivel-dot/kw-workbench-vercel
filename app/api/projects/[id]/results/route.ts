import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
import { applyBulkAction, parseBulkActionPayload } from "@/lib/modules/results-bulk";
import { parseResultsFilters } from "@/lib/modules/results-filters";
import { parsePagingParams } from "@/lib/modules/results-paging";
import { loadResultsPage } from "@/lib/modules/results-query";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function ensureOwnedSubproject(params: {
  projectId: string;
  subprojectId: string;
  userId: string;
}) {
  return prisma.subproject.findFirst({
    where: {
      id: params.subprojectId,
      project_id: params.projectId,
      project: {
        owner_user_id: params.userId,
      },
    },
    select: { id: true },
  });
}

export const GET = withApiErrors(async (request: NextRequest, context: RouteContext) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { id } = await context.params;
  const rawSubprojectId = request.nextUrl.searchParams.get("subprojectId");
  const subprojectId = rawSubprojectId ? rawSubprojectId.trim() : "";

  const project = await prisma.project.findFirst({
    where: {
      id,
      owner_user_id: user.id,
    },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });
  }

  if (subprojectId) {
    const subproject = await ensureOwnedSubproject({
      projectId: id,
      subprojectId,
      userId: user.id,
    });

    if (!subproject) {
      return NextResponse.json({ error: "Sezione non trovata" }, { status: 404 });
    }
  }

  const filters = parseResultsFilters(request.nextUrl.searchParams);
  const { page: requestedPage, pageSize } = parsePagingParams(request.nextUrl.searchParams);
  const result = await loadResultsPage({
    projectId: id,
    subprojectId: subprojectId || null,
    filters,
    page: requestedPage,
    pageSize,
  });

  const serialized = result.rows.map((row) => ({
    ...row,
    subproject_name: row.subproject.name,
    low_top_of_page_bid_micros:
      row.low_top_of_page_bid_micros != null ? row.low_top_of_page_bid_micros.toString() : null,
    high_top_of_page_bid_micros:
      row.high_top_of_page_bid_micros != null ? row.high_top_of_page_bid_micros.toString() : null,
  }));

  return NextResponse.json({
    data: serialized,
    meta: {
      page: result.page,
      pageSize,
      total: result.filteredCount,
      totalPages: result.totalPages,
    },
  });
});

export const PATCH = withApiErrors(async (request: NextRequest, context: RouteContext) => {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { id } = await context.params;

  const project = await prisma.project.findFirst({
    where: {
      id,
      owner_user_id: user.id,
    },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });
  }

  const payload = parseBulkActionPayload(await request.json());

  const scopedSubprojectId = payload.subprojectId || null;
  if (scopedSubprojectId) {
    const subproject = await ensureOwnedSubproject({
      projectId: id,
      subprojectId: scopedSubprojectId,
      userId: user.id,
    });

    if (!subproject) {
      return NextResponse.json({ error: "Sezione non trovata" }, { status: 404 });
    }
  }

  const updated = await applyBulkAction(id, payload);

  return NextResponse.json({ success: true, updated });
});

