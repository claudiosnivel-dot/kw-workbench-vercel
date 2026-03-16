-- CreateTable
CREATE TABLE "google_sheets_credentials" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "connected_email" TEXT,
    "refresh_token_encrypted" TEXT NOT NULL,
    "scope" TEXT,
    "token_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_sheets_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_sheets_credentials_user_id_key" ON "google_sheets_credentials"("user_id");

-- CreateIndex
CREATE INDEX "google_sheets_credentials_user_id_idx" ON "google_sheets_credentials"("user_id");

-- AddForeignKey
ALTER TABLE "google_sheets_credentials"
ADD CONSTRAINT "google_sheets_credentials_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
