-- Reply-To dei messaggi nell'outbox (T-1805): il modulo contatti risponde al mittente. Additiva e nullable.
ALTER TABLE "email_outbox" ADD COLUMN "reply_to" TEXT;
