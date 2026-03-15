import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { buildResultsWhere, parseResultsFilters } from "@/lib/modules/results-filters";
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

export async function GET(request: NextRequest, context: RouteContext) {
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
  const where = buildResultsWhere(id, filters, subprojectId || null);
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? 1));
  const pageSize = Math.min(500, Math.max(20, Number(request.nextUrl.searchParams.get("pageSize") ?? 100)));

  const [total, rows] = await Promise.all([
    prisma.keywordCandidate.count({ where }),
    prisma.keywordCandidate.findMany({
      where,
      orderBy: [{ score: "desc" }, { keyword: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        project_id: true,
        subproject_id: true,
        keyword: true,
        normalized_keyword: true,
        canonical_keyword: true,
        source: true,
        source_query: true,
        brand_status: true,
        brand_reason: true,
        review_status: true,
        selected_for_export: true,
        keyword_type: true,
        search_intent: true,
        is_question: true,
        is_local_intent: true,
        is_tool_intent: true,
        is_commercial_intent: true,
        metrics_status: true,
        metrics_provider: true,
        avg_monthly_searches: true,
        competition: true,
        low_top_of_page_bid_micros: true,
        high_top_of_page_bid_micros: true,
        score: true,
        metrics_updated_at: true,
        created_at: true,
        updated_at: true,
        subproject: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  const serialized = rows.map((row) => ({
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
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
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
}


