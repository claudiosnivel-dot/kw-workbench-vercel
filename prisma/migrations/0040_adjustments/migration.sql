-- Macrotask 20 adjustments (D-36): colonne additive, nessuna riga esistente cambia significato.

-- T-2002: istante della prima richiesta di annullamento; entro 60 secondi da created_at l'avvio non consuma la quota.
ALTER TABLE "jobs" ADD COLUMN "cancel_requested_at" TIMESTAMP(3);

-- T-2004: progetto creato dall'onboarding, escluso dal conteggio di maxProjects.
ALTER TABLE "projects" ADD COLUMN "created_via_onboarding" BOOLEAN NOT NULL DEFAULT false;

-- T-2008: autore dei workspace di squadra creati dall'interfaccia (limite tecnico per utente); null per i personali.
ALTER TABLE "workspaces" ADD COLUMN "created_by_user_id" TEXT;

CREATE INDEX "workspaces_created_by_user_id_idx" ON "workspaces"("created_by_user_id");

ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
