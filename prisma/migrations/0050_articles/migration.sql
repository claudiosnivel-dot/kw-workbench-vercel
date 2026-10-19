-- Macrotask 40 article-data, T-4002 (D-46). Migrazione additiva.
-- articles: un articolo per pagina del piano (page_id unico, cancellato con la pagina), con lunghezza, note, stato,
-- meta, slug, scaletta, immagini e controlli SEO; article_sections: i blocchi in ordine (introduzione, H2, FAQ) con il
-- testo in Markdown; article_runs: i lavori di generazione a passi (fase, cursore, avanzamento, battito, lease) con il
-- workspace per i limiti. RLS abilitata senza policy su ogni tabella nuova, come le altre di public (T-205, D-20).
-- CreateEnum
CREATE TYPE "ArticleLength" AS ENUM ('SHORT', 'MEDIUM', 'LONG');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('GENERATING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ArticleSectionKind" AS ENUM ('INTRO', 'H2', 'FAQ');

-- CreateEnum
CREATE TYPE "ArticleRunScope" AS ENUM ('ARTICLE', 'SECTION');

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "length" "ArticleLength" NOT NULL,
    "notes" VARCHAR(1000),
    "status" "ArticleStatus" NOT NULL DEFAULT 'GENERATING',
    "error_code" TEXT,
    "meta_title" TEXT,
    "meta_description" TEXT,
    "slug" TEXT,
    "outline" JSONB,
    "images" JSONB,
    "seo_report" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_sections" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "ArticleSectionKind" NOT NULL,
    "heading" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "checks" JSONB,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_runs" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "scope" "ArticleRunScope" NOT NULL,
    "section_id" TEXT,
    "instruction" VARCHAR(500),
    "status" "JobStatus" NOT NULL DEFAULT 'pending',
    "phase" TEXT NOT NULL DEFAULT 'outline',
    "cursor" JSONB NOT NULL DEFAULT '{}',
    "progress_done" INTEGER NOT NULL DEFAULT 0,
    "progress_total" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "heartbeat_at" TIMESTAMP(3),
    "locked_until" TIMESTAMP(3),
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "articles_page_id_key" ON "articles"("page_id");

-- CreateIndex
CREATE INDEX "articles_project_id_idx" ON "articles"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "article_sections_article_id_position_key" ON "article_sections"("article_id", "position");

-- CreateIndex
CREATE INDEX "article_runs_article_id_status_idx" ON "article_runs"("article_id", "status");

-- CreateIndex
CREATE INDEX "article_runs_status_locked_until_idx" ON "article_runs"("status", "locked_until");

-- CreateIndex
CREATE INDEX "article_runs_workspace_id_idx" ON "article_runs"("workspace_id");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "strategy_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_sections" ADD CONSTRAINT "article_sections_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_runs" ADD CONSTRAINT "article_runs_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_runs" ADD CONSTRAINT "article_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_runs" ADD CONSTRAINT "article_runs_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "article_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Al massimo un lavoro pending o running per articolo: un secondo avvio contemporaneo fallisce sull'indice e la rotta
-- risponde 409 JOB_ALREADY_ACTIVE (CWE-362). Prisma non esprime gli indici parziali.
CREATE UNIQUE INDEX "article_runs_one_active_per_article" ON "article_runs"("article_id") WHERE "status" IN ('pending', 'running');

-- Data API di Supabase chiusa anche sulle nuove tabelle (T-205, D-20).
ALTER TABLE "articles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "article_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "article_runs" ENABLE ROW LEVEL SECURITY;
