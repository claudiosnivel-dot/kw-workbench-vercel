-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NEEDS_CHOICE', 'IN_PROGRESS', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "OnboardingStep" AS ENUM ('WELCOME', 'PROJECT_CREATE', 'PROJECT_TARGETING', 'SECTION_CREATE', 'SEEDS', 'RUN', 'REVIEW_EXPORT');

-- CreateEnum
CREATE TYPE "OnboardingEntryMode" AS ENUM ('NONE', 'RESUME', 'RESTART');

-- CreateTable
CREATE TABLE "user_onboarding_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'NEEDS_CHOICE',
    "current_step" "OnboardingStep" NOT NULL DEFAULT 'WELCOME',
    "entry_mode" "OnboardingEntryMode" NOT NULL DEFAULT 'NONE',
    "active_project_id" TEXT,
    "active_subproject_id" TEXT,
    "first_export_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_onboarding_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_onboarding_progress_user_id_key" ON "user_onboarding_progress"("user_id");

-- CreateIndex
CREATE INDEX "user_onboarding_progress_status_idx" ON "user_onboarding_progress"("status");

-- CreateIndex
CREATE INDEX "user_onboarding_progress_current_step_idx" ON "user_onboarding_progress"("current_step");

-- CreateIndex
CREATE INDEX "user_onboarding_progress_active_project_id_idx" ON "user_onboarding_progress"("active_project_id");

-- CreateIndex
CREATE INDEX "user_onboarding_progress_active_subproject_id_idx" ON "user_onboarding_progress"("active_subproject_id");

-- AddForeignKey
ALTER TABLE "user_onboarding_progress"
ADD CONSTRAINT "user_onboarding_progress_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_onboarding_progress"
ADD CONSTRAINT "user_onboarding_progress_active_project_id_fkey"
FOREIGN KEY ("active_project_id") REFERENCES "projects"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_onboarding_progress"
ADD CONSTRAINT "user_onboarding_progress_active_subproject_id_fkey"
FOREIGN KEY ("active_subproject_id") REFERENCES "subprojects"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
