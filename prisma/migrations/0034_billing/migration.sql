-- T-1603: abbonamenti per workspace e registro dei webhook di Paddle Billing. Una riga di workspace_subscriptions per
-- workspace (workspace_id unico) legata a una sola subscription del provider (provider_subscription_id unico); lo stato
-- cambia solo dai webhook firmati. billing_events registra ogni consegna una volta per event_id (idempotenza) con
-- l'esito applied, stale o ignored. RLS abilitata senza policy (T-205, D-20).
-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'past_due', 'paused', 'canceled');

-- CreateEnum
CREATE TYPE "BillingEventOutcome" AS ENUM ('applied', 'stale', 'ignored');

-- CreateTable
CREATE TABLE "workspace_subscriptions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_subscription_id" TEXT NOT NULL,
    "provider_customer_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "cancel_at" TIMESTAMP(3),
    "past_due_since" TIMESTAMP(3),
    "currency_code" TEXT,
    "recurring_amount_minor" BIGINT,
    "billing_interval" TEXT,
    "billing_frequency" INTEGER,
    "quantity" INTEGER,
    "last_event_occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "notification_id" TEXT,
    "outcome" "BillingEventOutcome" NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_subscriptions_workspace_id_key" ON "workspace_subscriptions"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_subscriptions_provider_subscription_id_key" ON "workspace_subscriptions"("provider_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_events_event_id_key" ON "billing_events"("event_id");

-- AddForeignKey
ALTER TABLE "workspace_subscriptions" ADD CONSTRAINT "workspace_subscriptions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data API di Supabase chiusa anche sulle nuove tabelle (T-205, D-20).
ALTER TABLE "workspace_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_events" ENABLE ROW LEVEL SECURITY;
