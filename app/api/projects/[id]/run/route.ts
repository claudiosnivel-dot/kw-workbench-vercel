import { NextResponse } from "next/server";
import { requireAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { enqueueExtractionJob, runJobById } from "@/lib/modules/jobs/job-runner";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUserFromRequest(request);
  const { id } = await context.params;

  const project = await prisma.project.findFirst({
    where: {
      id,
      owner_user_id: user.id,
    },
    include: {
      subprojects: {
        orderBy: [{ position: "asc" }, { created_at: "asc" }],
        select: { id: true, name: true },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Progetto non trovato" }, { status: 404 });
  }

  if (project.subprojects.length === 0) {
    return NextResponse.json({ error: "Nessun sottoprogetto disponibile. Crea prima un sottoprogetto." }, { status: 400 });
  }

  if (project.subprojects.length > 1) {
    return NextResponse.json(
      {
        error:
          "Questo progetto ha piu sottoprogetti. Avvia l'estrazione dal sottoprogetto specifico nella dashboard progetto.",
      },
      { status: 409 }
    );
  }

  const target = project.subprojects[0];
  const job = await enqueueExtractionJob(project.id, target.id);
  const completed = await runJobById(job.id);

  return NextResponse.json({ data: completed });
}
