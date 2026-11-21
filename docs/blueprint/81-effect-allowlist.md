# 81-effect-allowlist — Macrotask `effect-allowlist`

> Avviso high nuovo di effect e avviso di picomatch ritirato (D-68): il 2026-11-20, nel checkpoint del 73, `npm audit` riporta GHSA-7589-6fvf-x4pw di effect (ReDoS in Schema.TemplateLiteral, versioni fino alla 3.22.0, corretto dalla 3.22.1, pubblicato il 2026-11-19) e non riporta più GHSA-fc5q-39xc-vjpf di picomatch, ritirato il 2026-11-18. Il modulo mette l'avviso di effect nell'allowlist con il motivo e il task che lo chiude e toglie la voce ritirata di picomatch, così il test delle dipendenze resta il controllo e il 73 si chiude.

## Obiettivo del macrotask
`tests/tooling/dependency-audit.test.ts` vuole ogni avviso high nell'allowlist con un task di chiusura (AC-401-2, AC-6001-2) e nessuna voce che npm audit non riporta più. effect 3.20.0 arriva solo da `prisma` 7.10.0 (devDependency, il CLI delle migrazioni e del generate) attraverso `@prisma/config`, che lo fissa esatto anche nella 7.10.1, l'ultima: nessuna versione corretta nella serie 3.20, quindi la regola di D-67 chiede all'utente. Scelta dell'utente del 2026-11-20: «scelta A», l'eccezione invece di un `overrides` di npm. Dopo questo modulo:

- **Eccezione dichiarata**: GHSA-7589-6fvf-x4pw di effect nell'allowlist, con il motivo e la chiusura in T-8002 (modulo 80, emendato), che porta effect alla versione corretta con un aggiornamento di Prisma.
- **Voce ritirata tolta**: niente più GHSA-fc5q-39xc-vjpf nell'allowlist; AC-7901-1 emendato (npm audit non lo riporta e l'allowlist non ha voci per picomatch).

## Task atomici

```yaml
- id: T-8101
  title: "Eccezione dell'allowlist per l'avviso di effect e voce ritirata di picomatch tolta"
  macrotask: "effect-allowlist"
  depends_on: [T-401, T-6001, T-7901]

  objective: >
    Tenere verde il test delle dipendenze con un avviso high che non ha una correzione nella serie fissata da Prisma,
    dichiarandolo nell'allowlist con il motivo e il task che lo chiude, e togliere la voce di un avviso ritirato.

  definition_of_done:
    - "tests/tooling/audit-allowlist.json: una sola voce, ghsa GHSA-7589-6fvf-x4pw, package effect, il motivo (solo il CLI di Prisma attraverso @prisma/config, che fissa effect 3.20.0, nessuna correzione nella serie 3.20 il 2026-11-20) e closedBy [T-8002]; nessuna voce per GHSA-fc5q-39xc-vjpf."
    - "tests/tooling/dependency-audit.test.ts: il caso di AC-7901-1 emendato (npm audit non riporta GHSA-fc5q-39xc-vjpf e l'allowlist non ha voci per picomatch); un caso per la voce di effect e uno per effect fuori da package.json e dai sorgenti, con ogni effect dell'albero sotto prisma."
    - "docs/blueprint/79-picomatch-allowlist.md: AC-7901-1 emendato con il rimando a D-68; docs/blueprint/80-dep-refresh.md: T-8002 emendato per effect."

  acceptance_criteria:
    - id: AC-8101-1
      given: "l'allowlist con la voce di effect e npm audit che riporta GHSA-7589-6fvf-x4pw"
      when: "tests/tooling/dependency-audit.test.ts confronta il rapporto con l'allowlist"
      then: "ogni avviso high del rapporto è nell'allowlist, la voce GHSA-7589-6fvf-x4pw ha package effect, un motivo non vuoto e closedBy [T-8002], e T-8002 compare come id di un task in docs/blueprint"
    - id: AC-8101-2
      given: "package.json, i sorgenti dell'app e l'albero delle dipendenze"
      when: "il test cerca effect fra le dipendenze dirette, negli import di app, lib, components, prisma e scripts e in npm ls effect"
      then: "effect non è in dependencies né in devDependencies, nessun file importa o richiede effect e ogni effect dell'albero è sotto prisma"

  target_tests:
    - file: "tests/tooling/dependency-audit.test.ts"
      covers: [AC-8101-1, AC-8101-2]

  security_notes:
    - "A06 / CWE-1104, CWE-1333: avviso ReDoS di una dipendenza transitiva del CLI di Prisma, usata per leggere prisma.config.ts e non dall'app in esecuzione; l'eccezione è temporanea, motivata e chiusa da un task; il test fallisce se l'avviso non è più riportato e la voce resta."

  out_of_scope:
    - "L'aggiornamento di effect (T-8002, con una versione di Prisma che lo porta corretto); un overrides di npm (alternativa scartata dall'utente il 2026-11-20); gli avvisi moderati (modulo 80)."
```

## Self-check
- Strutturale: `validate_blueprint.mjs docs/blueprint` exit 0.
- Modulo dalla risposta dell'utente del 2026-11-20 («scelta A») al riepilogo del 73, il cui checkpoint era NON-VERDE solo per `dependency-audit` (D-68).
- Esposizione: dal lockfile, effect è solo sotto `prisma` → `@prisma/config` (devDependency), il CLI che legge `prisma.config.ts` per migrazioni, generate e build; nessun sorgente dell'app lo importa e il client generato non lo usa. Valutata solo dall'albero delle dipendenze e dal testo dell'avviso.
- Ordine: si costruisce subito, prima di chiudere il 73, per scelta dell'utente; dipende da 04, 60 e 79, già chiusi. L'80 dipende anche dall'81 (T-8002 chiude la sua voce), come il 40 dipende dal 51.
- Note di costruzione (2026-11-20; la scelta di fondo è dell'utente, D-68; questi dettagli tecnici restano dell'agente, D-69):
  - voce dell'allowlist con il motivo in italiano, che rimanda a D-68 e T-8101, e `closedBy` ["T-8002"];
  - il caso di AC-7901-1 cerca GHSA-fc5q-39xc-vjpf nel testo intero del rapporto di npm audit e vuole l'allowlist
    senza voci con quel GHSA o con il package picomatch;
  - AC-8101-2 legge `npm ls effect --json`: l'unica dipendenza diretta che porta effect è `prisma`;
  - AC-8101-1 e il caso di AC-7901-1 visti rossi prima del cambio dell'allowlist, poi verdi; AC-8101-2 è un'assenza.
