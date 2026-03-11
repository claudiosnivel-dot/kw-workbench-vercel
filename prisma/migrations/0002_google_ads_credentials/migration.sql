-- CreateTable
CREATE TABLE "google_ads_credentials" (
    "id" TEXT NOT NULL,
    "singleton_key" TEXT NOT NULL DEFAULT 'default',
    "connected_email" TEXT,
    "customer_id" TEXT,
    "login_customer_id" TEXT,
    "refresh_token_encrypted" TEXT NOT NULL,
    "scope" TEXT,
    "token_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_ads_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_ads_credentials_singleton_key_key" ON "google_ads_credentials"("singleton_key");
