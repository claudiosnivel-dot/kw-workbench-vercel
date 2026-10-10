-- T-1901: strategie hub and spoke (D-33). Una strategia fotografa le keyword del perimetro al momento della
-- generazione (strategy_keywords senza chiave esterna verso keyword_candidates: il re-run non la cambia, D-19); le
-- pagine (strategy_pages) sono hub e spoke con H1 e H2 suggeriti. Tabelle nuove: additiva. Una keyword compare al
-- massimo una volta per strategia e ogni pagina ha al massimo una keyword MAIN (indice unico parziale, solo qui).
-- RLS abilitata senza policy (T-205, D-20).
-- CreateEnum
CREATE TYPE "StrategyMode" AS ENUM ('AUTO', 'EXPERT');

-- CreateEnum
CREATE TYPE "StrategyPageKind" AS ENUM ('HUB', 'SPOKE');

-- CreateEnum
CREATE TYPE "StrategyKeywordRole" AS ENUM ('MAIN', 'SECONDARY');

-- CreateEnum
CREATE TYPE "StrategyContentType" AS ENUM ('guide', 'list', 'comparison', 'product_category', 'faq', 'local', 'tool');

-- CreateTable
CREATE TABLE "strategies" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "created_by_user_id" TEXT,
    "mode" "StrategyMode" NOT NULL,
    "settings" JSONB NOT NULL,
    "language" TEXT NOT NULL,
    "considered_count" INTEGER NOT NULL,
    "assigned_count" INTEGER NOT NULL,
    "unassigned_count" INTEGER NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy_pages" (
    "id" TEXT NOT NULL,
    "strategy_id" TEXT NOT NULL,
    "kind" "StrategyPageKind" NOT NULL,
    "hub_page_id" TEXT,
    "h1" VARCHAR(200) NOT NULL,
    "h2" TEXT[],
    "h1_edited" BOOLEAN NOT NULL DEFAULT false,
    "h2_edited" BOOLEAN NOT NULL DEFAULT false,
    "content_type" "StrategyContentType" NOT NULL,
    "priority" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "reason_code" TEXT NOT NULL,
    "reason_params" JSONB NOT NULL,

    CONSTRAINT "strategy_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy_keywords" (
    "id" TEXT NOT NULL,
    "strategy_id" TEXT NOT NULL,
    "page_id" TEXT,
    "role" "StrategyKeywordRole" NOT NULL,
    "keyword" TEXT NOT NULL,
    "canonical_keyword" TEXT NOT NULL,
    "volume" INTEGER,
    "score" DOUBLE PRECISION,
    "score_source" "ScoreSource" NOT NULL,
    "search_intent" "SearchIntent" NOT NULL,
    "keyword_type" "KeywordType" NOT NULL,
    "is_question" BOOLEAN NOT NULL,
    "is_local" BOOLEAN NOT NULL,
    "source_keyword_id" TEXT,

    CONSTRAINT "strategy_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "strategies_project_id_created_at_idx" ON "strategies"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "strategy_pages_strategy_id_position_idx" ON "strategy_pages"("strategy_id", "position");

-- CreateIndex
CREATE INDEX "strategy_pages_hub_page_id_idx" ON "strategy_pages"("hub_page_id");

-- CreateIndex
CREATE INDEX "strategy_keywords_page_id_idx" ON "strategy_keywords"("page_id");

-- CreateIndex
CREATE UNIQUE INDEX "strategy_keywords_strategy_id_canonical_keyword_key" ON "strategy_keywords"("strategy_id", "canonical_keyword");

-- Una sola keyword principale per pagina (T-1901, AC-1901-5): indice unico parziale, non esprimibile nello schema Prisma.
CREATE UNIQUE INDEX "strategy_keywords_page_main_key" ON "strategy_keywords"("page_id") WHERE "role" = 'MAIN';

-- AddForeignKey
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_pages" ADD CONSTRAINT "strategy_pages_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_pages" ADD CONSTRAINT "strategy_pages_hub_page_id_fkey" FOREIGN KEY ("hub_page_id") REFERENCES "strategy_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_keywords" ADD CONSTRAINT "strategy_keywords_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_keywords" ADD CONSTRAINT "strategy_keywords_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "strategy_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data API di Supabase chiusa anche sulle nuove tabelle (T-205, D-20).
ALTER TABLE "strategies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "strategy_pages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "strategy_keywords" ENABLE ROW LEVEL SECURITY;
