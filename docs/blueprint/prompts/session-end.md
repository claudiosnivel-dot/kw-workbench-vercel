# session-end — Seo God Mode

> Da incollare alla chiusura di ogni sessione di lavoro.

---

## ▶ Prompt da incollare

```
Chiudiamo la sessione di lavoro su **Seo God Mode** (postgres-jsts). Niente nuovo
lavoro: consolida, registra, lascia tutto riprendibile. Il "fatto" si dichiara per
FATTI verificati, mai a sensazione (L-COL-006). In modalità silenziosa
(~/.claude/CLAUDE.md) questo prompt si esegue in autonomia al termine del
macrotask, senza chiedere conferme.

1) CHECKPOINT AL CONFINE DEL MACROTASK
   Conferma che il CHECKPOINT è girato al confine del macrotask e riassumine
   l'esito controllo per controllo (igiene/dead-code, sicurezza, regressioni,
   conformità-logica): VERDE/ROSSO per ciascuno, e il fix_state dei finding
   (verified / mitigated-residual / open). Il verde è l'esito di un ORACOLO o di
   un test, MAI una tua frase (L-COL-002). Un controllo NON eseguito (es. semgrep
   senza Docker) NON è un verde (L-COL-006).

2) AGGIORNA docs/blueprint/SESSION-STATE.md (unica fonte di contesto per la
   prossima sessione):
   • Macrotask fatti / in corso / da fare rispetto al piano:
     01 foundation · 02 environments · 03 hotfix · 04 stack-upgrade ·
     05 auth-hardening · 06 observability-ops · 07 extraction-fixes ·
     08 results-export · 09 google-integrations · 10 onboarding · 11 cleanup ·
     12 background-jobs · 13 i18n · 14 accounts-email · 15 workspaces ·
     16 billing · 17 abuse-quotas · 18 marketing-legal
   • Baseline (.trueline/baseline.json, .trueline/hygiene-baseline.json) e budget
     consumato (MAX_RETRIES_PER_FINDING = 2, GLOBAL_WALL_CLOCK_MS = 242401).
   • Per ogni task chiuso: id, output prodotto, esito del gate (quale oracolo/test
     ha prodotto il verde).
   • Decisioni del ledger confermate o emendate in sessione.

3) REGISTRA LO STATO GIT (git a strati — L-COL-024, L-COL-025):
   • Branch di lavoro e commit (con id dei task + esito del gate).
   • Merge su master: avvenuto SOLO se checkpoint verde E mio "vai" (master è
     accoppiato al deploy di produzione); altrimenti SOSPESO.
   • Push: indica se il branch è stato pushato, se contiene T-202 e se contiene
     migrazioni (vietato senza T-202; con migrazioni vietato finché T-203 non
     conferma un DB di Preview separato).

4) VERIFICA-FIX RIVERIFICATA (L-COL-003)
   Per ogni fix applicata in sessione, conferma che è stata riverificata con lo
   STESSO oracolo e con i test, e che le rimozioni di dead-code sono passate da me
   (L-COL-005, L-COL-021). Una fix non riverificata non è "fatta".

5) FRAMING ONESTO (L-COL-006)
   Usa "trovato e verificata la correzione di X" / "questi controlli sono passati",
   MAI "Seo God Mode è sicuro/pronto". Dichiara sempre la COPERTURA: cosa è stato
   verificato e cosa no.

Applica l'aggiornamento a docs/blueprint/SESSION-STATE.md e committalo sul branch
di lavoro in autonomia. Unico output: il riepilogo dei punti 1, 3 e 5, con i
commit fatti e merge/push eseguiti o sospesi con il motivo.
```
