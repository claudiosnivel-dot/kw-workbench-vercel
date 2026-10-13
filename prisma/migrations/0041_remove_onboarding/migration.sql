-- Macrotask 23 ux-shell, T-2306 (D-39): rimozione dell'onboarding a 7 passi, approvata dall'utente il 2026-10-13.
-- Non additiva (D-05): tabelle e tipi dell'onboarding vanno via con le righe. projects.created_via_onboarding resta: la
-- usa l'avvio rapido (T-2301) per il primo progetto del workspace, fuori dal limite dei progetti (T-2004).

DROP TABLE "onboarding_idempotency_keys";

DROP TABLE "user_onboarding_progress";

DROP TYPE "OnboardingIdempotencyKind";

DROP TYPE "OnboardingEntryMode";

DROP TYPE "OnboardingStep";

DROP TYPE "OnboardingStatus";
