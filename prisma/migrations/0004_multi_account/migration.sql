-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- AlterTable
ALTER TABLE "projects" ADD COLUMN "owner_user_id" TEXT;

-- CreateIndex
CREATE INDEX "projects_owner_user_id_idx" ON "projects"("owner_user_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "google_ads_credentials" ADD COLUMN "user_id" TEXT;
ALTER TABLE "google_ads_credentials" ALTER COLUMN "singleton_key" DROP NOT NULL;
ALTER TABLE "google_ads_credentials" ALTER COLUMN "singleton_key" DROP DEFAULT;

-- DropIndex
DROP INDEX "google_ads_credentials_singleton_key_key";

-- CreateIndex
CREATE UNIQUE INDEX "google_ads_credentials_user_id_key" ON "google_ads_credentials"("user_id");
CREATE INDEX "google_ads_credentials_singleton_key_idx" ON "google_ads_credentials"("singleton_key");

-- AddForeignKey
ALTER TABLE "google_ads_credentials" ADD CONSTRAINT "google_ads_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
