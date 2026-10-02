# session-start — Seo God Mode

> Da incollare all'apertura di ogni sessione di lavoro (dopo la prima, che usa
> `project-start.md`).

---

## ▶ Prompt da incollare

```
Riprendiamo il lavoro su **Seo God Mode** (postgres-jsts: Next.js + Prisma su
Postgres Supabase). Il blueprint è il piano: si costruisce secondo i task, non si
ridiscute il design.

1) RECUPERO CONTESTO — leggi PRIMA di qualunque azione:
   • docs/blueprint/SESSION-STATE.md → fonte di verità sullo stato vivo: macrotask
     fatti/in corso, baseline, budget consumato, stato git, note di carry-over.
   • docs/blueprint/ → il piano (00-INDEX + modulo del macrotask di oggi).

2) SELEZIONA IL MACROTASK CORRENTE rispettando il DAG delle dipendenze:
   01 foundation · 02 environments (01) · 03 hotfix (01) ·
   04 stack-upgrade (01, 02, 03) · 05 auth-hardening (02, 04) ·
   06 observability-ops (01, 02, 04, 05) · 07 extraction-fixes (01, 03) ·
   08 results-export (01, 04, 05) · 09 google-integrations (03, 05, 07) ·
   10 onboarding (03, 05) · 11 cleanup (01, 04, 05, 07, 08) ·
   12 background-jobs (02, 03, 04, 05, 07, 10) · 13 i18n (04, 05, 12) ·
   14 accounts-email (02, 05, 12, 13) · 15 workspaces (11, 12, 13, 14) ·
   16 billing (09, 15) · 17 abuse-quotas (05, 09, 12, 14, 16) ·
   18 marketing-legal (03, 09, 13, 14, 15, 16, 17)
   Scegli il primo macrotask non ancora chiuso le cui dipendenze sono già verdi.
   Se usa una decisione PROPOSTA del ledger non ancora confermata, chiedimela; se
   usa una decisione APERTA (D-14, D-15), fermati.

3) RIPETI i task atomici del macrotask scelto. Per ciascuno enuncia, dal blueprint:
   • definition_of_done — gli artefatti osservabili che provano che il lavoro c'è;
   • acceptance_criteria — le asserzioni comportamentali (given/when/then);
   • target_tests — i test che rendono eseguibili i criteri.
   Questi target_tests sono l'ORACOLO del controllo di conformità-logica del
   checkpoint (L-COL-019): è contro di loro che si misura "verde".

4) PREPARA IL BRANCH DI LAVORO: trueline/build/<macrotask>, MAI su master.
   Esegui il preflight degli oracoli (scripts/preflight.mjs) se non è già verde in
   SESSION-STATE. Avvia il Postgres di test (docker-compose.test.yml) se il
   macrotask ha test d'integrazione.

5) PROMEMORIA: al CONFINE DEL MACROTASK gira il CHECKPOINT prima di committare.
   master è accoppiato al deploy di produzione: il merge resta un mio "vai".
   Niente push di branch senza T-202, né di branch con migrazioni finché T-203
   non è chiuso (D-04).

INVARIANTI NON NEGOZIABILI — tienile in testa per OGNI task:
  • ORACLE-AS-JUDGE, MAI LLM-AS-JUDGE (L-COL-002): "verde" = esito di un oracolo
    o di un test, mai una tua frase ("è sicuro", "ho sistemato").
  • LOOP DI VERIFICA DELLA FIX OBBLIGATORIO (L-COL-003): applica → riesegui lo
    stesso oracolo → riesegui i test → accetta SOLO se sparito e nulla rotto.
  • HUMAN-IN-THE-LOOP SULLE FIX; DEAD-CODE MAI CANCELLATO IN AUTONOMIA
    (L-COL-005, L-COL-021).
  • GIT A STRATI (L-COL-024, L-COL-025): branch autonomo, merge su master gated
    dal verde e da me, distruttive mai autonome, DEPLOY NON SUPERVISIONATO BLOCCATO.
  • NESSUN FALSO "VIA LIBERA"; COPERTURA SEMPRE DICHIARATA (L-COL-006): un
    controllo non eseguito NON è un verde.

Posizioni utili: blueprint/stato → docs/blueprint/ / docs/blueprint/SESSION-STATE.md;
baseline → .trueline/baseline.json, .trueline/hygiene-baseline.json; budget →
MAX_RETRIES_PER_FINDING = 2, GLOBAL_WALL_CLOCK_MS = 242401.

Dopo aver letto docs/blueprint/SESSION-STATE.md: dichiara in poche righe lo stato,
il macrotask scelto coi suoi task/criteri/test, il branch preparato, ed eventuali
blocchi. Poi attendi il mio via prima di costruire.
```
