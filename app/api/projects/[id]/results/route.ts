import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { withApiErrors } from "@/lib/http/errors";
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

  const payload = (await request.json()) as {
    action?: string;
    ids?: string[];
    subprojectId?: string;
  };

  const ids = Array.isArray(payload.ids) ? payload.ids.filter(Boolean) : [];
  if (!payload.action || ids.length === 0) {
    return NextResponse.json({ error: "Azione o ID mancanti" }, { status: 400 });
  }

  const scopedSubprojectId = payload.subprojectId?.trim() || null;
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

  const where: {
    project_id: string;
    subproject_id?: string;
    id: { in: string[] };
  } = {
    project_id: id,
    id: { in: ids },
  };

  if (scopedSubprojectId) {
    where.subproject_id = scopedSubprojectId;
  }

  if (payload.action === "approve") {
    await prisma.keywordCandidate.updateMany({ where, data: { review_status: "approved" } });
  } else if (payload.action === "reject") {
    await prisma.keywordCandidate.updateMany({ where, data: { review_status: "rejected" } });
  } else if (payload.action === "select") {
    await prisma.keywordCandidate.updateMany({ where, data: { selected_for_export: true } });
  } else if (payload.action === "unselect") {
    await prisma.keywordCandidate.updateMany({ where, data: { selected_for_export: false } });
  } else if (payload.action === "mark-review") {
    await prisma.keywordCandidate.updateMany({ where, data: { review_status: "pending" } });
  } else {
    return NextResponse.json({ error: "Azione non supportata" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
});

