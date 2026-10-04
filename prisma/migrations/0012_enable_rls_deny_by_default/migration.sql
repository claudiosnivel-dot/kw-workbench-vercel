-- Deny-by-default intenzionale: l'app non usa la Data API di Supabase (PostgREST), quindi
-- anon e authenticated non devono leggere né scrivere nulla in public.
-- Standard R1 soddisfatto: RLS abilitata su tutte le tabelle di public.
-- Eccezione allo standard R2 (nessuna policy) documentata in D-20 (docs/blueprint/00-INDEX.md §4):
-- Prisma si connette come proprietario delle tabelle e, senza FORCE ROW LEVEL SECURITY,
-- non è soggetto a RLS; l'isolamento per utente resta applicativo.
-- Convenzione per le migrazioni future: ogni nuova tabella in public abilita RLS nella
-- stessa migrazione (la fa rispettare tests/integration/rls-lockdown.test.ts).

-- EnableRowLevelSecurity
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subprojects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seeds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "keyword_candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "brand_blacklist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expansion_patterns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "google_ads_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "google_sheets_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_onboarding_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
