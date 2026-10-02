# project-start — Seo God Mode

> Da incollare **una volta**, all'avvio dei lavori sul blueprint. Le sessioni
> successive si aprono con `session-start.md` e si chiudono con `session-end.md`.
> Con la skill Trueline attiva, è la modalità BUILD a eseguire questa disciplina;
> senza la skill, questo prompt la fa girare a mano.

---

## ▶ Prompt da incollare

```
Stai per lavorare su **Seo God Mode** (repo kw-workbench-vercel; ecosistema
postgres-jsts: Next.js App Router + Prisma su Postgres Supabase, deploy Vercel),
seguendo un metodo blueprint-first con verifica oracle-first. Il PIANO È IL
BLUEPRINT: da qui si scrive codice secondo i task, non si reinventa il design.

PRIMA DI TUTTO — leggi, in quest'ordine:
  1. docs/blueprint/SESSION-STATE.md → la fonte di verità sullo STATO VIVO del
     progetto. Leggila prima di qualunque azione, sempre.
  2. docs/blueprint/ → il PIANO: 00-INDEX (mappa, piano di build, decision ledger,
     contratto di altitudine) + VISION-AND-CONSTRAINTS + i moduli 01-…18-, ognuno un
     macrotask coi suoi task atomici. Ogni task porta definition_of_done +
     acceptance_criteria + target_tests (L-COL-019): sono questi i criteri contro
     cui si misura "fatto", non una tua impressione.

DECISIONI BLOCCATE
  Le decisioni del ledger (00-INDEX §4) sono CHIUSE: si modificano solo con un
  emendamento registrato nel ledger, mai in silenzio. Le decisioni PROPOSTA vanno
  confermate con me prima del macrotask che le usa; le APERTE (D-14 piani e prezzi,
  D-15 testi legali) bloccano i task che le citano. In dubbio, fermati e chiedi.

PIANO DI MACROTASK (rispetta il DAG; tra parentesi i macrotask da cui dipende):
  01 foundation · 02 environments (01) · 03 hotfix (01) ·
  04 stack-upgrade (01, 02, 03) · 05 auth-hardening (02, 04) ·
  06 observability-ops (01, 02, 04, 05) · 07 extraction-fixes (01, 03) ·
  08 results-export (01, 04, 05) · 09 google-integrations (03, 05, 07) ·
  10 onboarding (03, 05) · 11 cleanup (01, 04, 05, 07, 08) ·
  12 background-jobs (02, 03, 04, 05, 07, 10) · 13 i18n (04, 05, 12) ·
  14 accounts-email (02, 05, 12, 13) · 15 workspaces (11, 12, 13, 14) ·
  16 billing (15) · 17 abuse-quotas (05, 12, 14, 16) ·
  18 marketing-legal (03, 09, 13, 14, 15, 16, 17)
  Un macrotask è l'unità al cui confine gira il CHECKPOINT ed è l'unità di commit
  atomico su git. Si parte da 01 foundation.

ECOSISTEMA E POSIZIONI
  • Ecosistema: postgres-jsts — isolamento APPLICATIVO sulle rotte (utente, poi
    workspace); floor oracoli: secret, dependency-vuln, authz.
  • Blueprint e stato vivo: docs/blueprint/ / docs/blueprint/SESSION-STATE.md.
  • Baseline: .trueline/baseline.json (sicurezza) e .trueline/hygiene-baseline.json
    (igiene). Budget del loop: MAX_RETRIES_PER_FINDING = 2,
    GLOBAL_WALL_CLOCK_MS = 242401.
  • Test: Vitest (unit, component, integration con Postgres di test in Docker) e
    Playwright; nessuna chiamata di rete reale nei test.

VINCOLI SPECIFICI DI QUESTO PROGETTO
  • master è ACCOPPIATO AL DEPLOY (vercel.json: ogni push su master va in
    produzione): il merge su master è sempre un "vai" umano, anche a checkpoint verde.
  • Le Preview Vercel eseguono prisma migrate deploy + seed: NON pushare branch con
    migrazioni finché T-203 non conferma un DB di Preview separato (D-04).
  • In produzione ci sono solo dati di test (D-05).

INVARIANTI NON NEGOZIABILI (regole della casa per l'intero progetto):
  • ORACLE-AS-JUDGE, MAI LLM-AS-JUDGE (L-COL-002): un task/controllo diventa
    "verde" solo per l'esito di un ORACOLO o di un test, mai perché tu dici "è
    sicuro" o "ho sistemato". Niente auto-assoluzioni.
  • LOOP DI VERIFICA DELLA FIX OBBLIGATORIO (L-COL-003): applica la fix → riesegui
    LO STESSO oracolo che l'ha trovata → riesegui i test → accetta SOLO se il
    finding è sparito E nulla si è rotto. Mai accettare una fix non riverificata.
  • HUMAN-IN-THE-LOOP SULLE FIX; DEAD-CODE MAI CANCELLATO IN AUTONOMIA
    (L-COL-005, L-COL-021): le rimozioni e le decisioni di merito passano da me;
    il dead-code si segnala, non si elimina da soli.
  • GIT A STRATI (L-COL-024, L-COL-025): lavora su BRANCH autonomo; il merge su
    master è GATED dal verde e, qui, anche da me; le operazioni distruttive non
    sono mai autonome; il DEPLOY NON SUPERVISIONATO È BLOCCATO.
  • NESSUN FALSO "VIA LIBERA"; COPERTURA SEMPRE DICHIARATA (L-COL-006): un
    controllo non eseguito NON è un verde; dichiara sempre cosa è stato verificato
    e cosa no. Usa "verificato X" / "il controllo Y è passato", mai "è sicuro".

Conferma di aver letto docs/blueprint/SESSION-STATE.md e il blueprint, riepiloga
in poche righe lo stato e il primo macrotask eseguibile (rispettando il DAG),
segnala incoerenze, e ATTENDI il mio via prima di scrivere codice.
```
