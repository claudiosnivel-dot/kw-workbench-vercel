-- T-1001: chiavi di idempotenza delle creazioni dell'onboarding (progetto e sezione); unicità (user_id, key).
-- Migrazione additiva. RLS abilitata senza policy come le altre tabelle di public (T-205, D-20).
-- CreateEnum
CREATE TYPE "OnboardingIdempotencyKind" AS ENUM ('PROJECT', 'SECTION');

-- CreateTable
CREATE TABLE "onboarding_idempotency_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "OnboardingIdempotencyKind" NOT NULL,
    "project_id" TEXT NOT NULL,
    "subproject_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "onboarding_idempotency_keys_project_id_idx" ON "onboarding_idempotency_keys"("project_id");

-- CreateIndex
CREATE INDEX "onboarding_idempotency_keys_subproject_id_idx" ON "onboarding_idempotency_keys"("subproject_id");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_idempotency_keys_user_id_key_key" ON "onboarding_idempotency_keys"("user_id", "key");

-- AddForeignKey
ALTER TABLE "onboarding_idempotency_keys" ADD CONSTRAINT "onboarding_idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_idempotency_keys" ADD CONSTRAINT "onboarding_idempotency_keys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_idempotency_keys" ADD CONSTRAINT "onboarding_idempotency_keys_subproject_id_fkey" FOREIGN KEY ("subproject_id") REFERENCES "subprojects"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- EnableRowLevelSecurity
ALTER TABLE "onboarding_idempotency_keys" ENABLE ROW LEVEL SECURITY;
