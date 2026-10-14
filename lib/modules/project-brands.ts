import { z } from "zod";
import { Prisma } from "@/lib/generated/prisma/client";
import { type AuthorizedProject, expectOneRow } from "@/lib/authz/workspace";
import { AppError, ValidationError } from "@/lib/http/errors";
import { brandReasonOf, evaluateBrandStatus, prepareBlacklist } from "@/lib/modules/brand-filter";
import { ProjectNotFoundError } from "@/lib/modules/project-access";
import { prisma } from "@/lib/prisma";

type ScopedProject = Pick<AuthorizedProject, "id" | "perimeter">;

const BRAND_MAX_LENGTH = 100;
const BRANDS_PER_PROJECT = 200;

const BRAND_FIELDS = { id: true, brand: true } satisfies Prisma.BrandBlacklistSelect;

const brandSchema = z.strictObject({
  brand: z.string().trim().min(1).max(BRAND_MAX_LENGTH),
});

/** Marchio già nella lista del progetto, anche scritto in un altro modo («Nike» e «nike»): 409 con codice stabile. */
class BrandExistsError extends AppError {
  constructor() {
    super(409, "BRAND_EXISTS", "Il marchio è già nella lista del progetto");
    this.name = "BrandExistsError";
  }
}

class BrandNotFoundError extends AppError {
  constructor() {
    super(404, "NOT_FOUND", "Marchio non trovato");
    this.name = "BrandNotFoundError";
  }
}

/** Parole del marchio nella forma canonica di T-702, senza articolo inglese da togliere: chiave di confronto. */
function brandTokens(brand: string): string[] {
  return prepareBlacklist([brand], "und")[0]?.tokens ?? [];
}

function parseBrand(payload: unknown): string {
  const result = brandSchema.safeParse(payload);
  if (!result.success) {
    throw new ValidationError(`Il marchio deve avere da 1 a ${BRAND_MAX_LENGTH} caratteri`);
  }
  if (brandTokens(result.data.brand).length === 0) {
    throw new ValidationError("Il marchio deve contenere lettere o cifre");
  }
  return result.data.brand;
}

/**
 * Riga del progetto bloccata nella transazione, con il perimetro del workspace nel where (T-1502): le scritture sui
 * marchi dello stesso progetto passano una alla volta (il tetto di BRANDS_PER_PROJECT resta vero) e una membership
 * revocata nel frattempo dà 404 senza scritture.
 */
async function lockProject(tx: Prisma.TransactionClient, project: ScopedProject): Promise<void> {
  const { count } = await tx.project.updateMany({
    where: { id: project.id, ...project.perimeter },
    data: { last_activity_at: new Date() },
  });
  expectOneRow(count, () => new ProjectNotFoundError());
}

// SQL statico dell'aggiornamento delle keyword trovate da un marchio: i dati entrano solo come parametri legati.
const UPDATE_KEYWORDS_SET = Prisma.sql`UPDATE "keyword_candidates" SET`;

/**
 * Applica un marchio nuovo alle keyword già trovate (T-2601): stessa regola della pipeline (evaluateBrandStatus di T-703
 * con la lingua effettiva della sezione), solo sulle keyword ancora allowed, così brand_reason resta quello del primo
 * marchio trovato. Con exclude_brands effettivo true diventano excluded e quelle da rivedere passano a rejected,
 * altrimenti review. Il filtro della lettura è un sovrainsieme (l'ultima parola del marchio dentro la forma canonica);
 * la scrittura è una sola query.
 */
async function applyBrand(tx: Prisma.TransactionClient, projectId: string, brand: string): Promise<void> {
  const project = await tx.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      language_code: true,
      exclude_brands: true,
      subprojects: { select: { id: true, language_code_override: true, exclude_brands_override: true } },
    },
  });
  // Impostazioni effettive della sezione come in resolveEffectiveProjectSettings: l'override, altrimenti il progetto.
  const sections = new Map(
    project.subprojects.map((section) => [
      section.id,
      {
        languageCode: section.language_code_override ?? project.language_code,
        excludeBrands: section.exclude_brands_override ?? project.exclude_brands,
      },
    ])
  );

  const candidates = await tx.keywordCandidate.findMany({
    where: { project_id: projectId, brand_status: "allowed", canonical_keyword: { contains: brandTokens(brand).at(-1) } },
    select: { id: true, subproject_id: true, keyword: true },
  });
  const matched: string[] = [];
  const excluded: string[] = [];
  for (const candidate of candidates) {
    const section = sections.get(candidate.subproject_id);
    if (!section) continue;
    const result = evaluateBrandStatus({
      keyword: candidate.keyword,
      blacklist: prepareBlacklist([brand], section.languageCode),
      excludeBrands: section.excludeBrands,
      languageCode: section.languageCode,
    });
    if (result.brand_status === "allowed") continue;
    matched.push(candidate.id);
    if (result.brand_status === "excluded") excluded.push(candidate.id);
  }
  if (matched.length === 0) {
    return;
  }

  await tx.$executeRaw`${UPDATE_KEYWORDS_SET}
    "brand_status" = (CASE WHEN "id" = ANY(${excluded}::text[]) THEN 'excluded' ELSE 'review' END)::"BrandStatus",
    "review_status" = (CASE WHEN "id" = ANY(${excluded}::text[]) AND "review_status" = 'pending' THEN 'rejected'
      ELSE "review_status"::text END)::"ReviewStatus",
    "brand_reason" = ${brandReasonOf(brand)},
    "updated_at" = ${new Date()}::timestamp(3)
    WHERE "project_id" = ${projectId} AND "brand_status" = 'allowed' AND "id" = ANY(${matched}::text[])`;
}

/** Marchi del progetto in ordine di inserimento; le righe globali (project_id null) restano fuori (T-2601). */
export function listProjectBrands(projectId: string) {
  return prisma.brandBlacklist.findMany({
    where: { project_id: projectId },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: BRAND_FIELDS,
  });
}

/**
 * Aggiunge un marchio al progetto e lo applica subito alle keyword già trovate, nella stessa transazione (T-2601):
 * da 1 a 100 caratteri dopo il trim, al massimo 200 marchi per progetto, un marchio già presente → 409 BRAND_EXISTS.
 */
export async function addProjectBrand(project: ScopedProject, payload: unknown) {
  const brand = parseBrand(payload);
  const key = brandTokens(brand).join(" ");

  return prisma.$transaction(async (tx) => {
    await lockProject(tx, project);
    const existing = await tx.brandBlacklist.findMany({ where: { project_id: project.id }, select: { brand: true } });
    if (existing.some((row) => brandTokens(row.brand).join(" ") === key)) {
      throw new BrandExistsError();
    }
    if (existing.length >= BRANDS_PER_PROJECT) {
      throw new ValidationError(`Il progetto ha già ${BRANDS_PER_PROJECT} marchi`);
    }

    const created = await tx.brandBlacklist.create({ data: { project_id: project.id, brand }, select: BRAND_FIELDS });
    await applyBrand(tx, project.id, brand);
    return created;
  });
}

/**
 * Toglie un marchio del progetto (T-2601): le keyword trovate da quel marchio tornano allowed senza brand_reason; la
 * scelta tieni/scarta non cambia. Un marchio di un altro progetto o globale → 404.
 */
export async function removeProjectBrand(project: ScopedProject, brandId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockProject(tx, project);
    const row = await tx.brandBlacklist.findFirst({ where: { id: brandId, project_id: project.id }, select: { brand: true } });
    if (!row) {
      throw new BrandNotFoundError();
    }

    await tx.brandBlacklist.deleteMany({ where: { id: brandId, project_id: project.id } });
    await tx.keywordCandidate.updateMany({
      where: { project_id: project.id, project: project.perimeter, brand_reason: brandReasonOf(row.brand) },
      data: { brand_status: "allowed", brand_reason: null },
    });
  });
}
