import { canonicalizeKeyword } from "@/lib/modules/normalization";
import {
  isStopword,
  modifierCategoryOfStem,
  sequenceModifierCategories,
  wordStem,
} from "@/lib/modules/strategy/modifiers";
import {
  MODIFIER_CATEGORIES,
  type ModifierCategory,
  type PlanAnchor,
  type PlanPage,
  type PlanReason,
  type ReasonParams,
  type StrategyContentType,
  type StrategyKeywordInput,
  type StrategyPlan,
  type StrategyReasonCode,
  type StrategyRules,
} from "@/lib/modules/strategy/types";

/*
 * Motore di raggruppamento hub and spoke (T-1901, D-33): funzione pura, senza DB, deterministica (stesso piano per
 * qualunque ordine delle keyword in ingresso). Lavora sulle parole della forma canonica senza parole vuote, ridotte
 * alla radice (singolare e plurale equivalenti, modifiers.ts).
 *
 * 1. Hub dalle seed: ogni seed è un hub candidato; una keyword va all'hub della seed più specifica (più parole) di cui
 *    contiene tutte le parole, a parità la seed con le parole prima in ordine alfabetico.
 * 2. Hub dai termini: per le keyword senza seed, il termine (non modificatore, non numerico) più pesato per volume
 *    (senza volumi per punteggio) presente in almeno 2 keyword; il nucleo dell'hub sono le parole non modificatore della
 *    keyword più corta e più cercata che lo contiene (se raccoglie almeno 2 keyword, altrimenti il solo termine). Si
 *    ripete finché un termine compare in almeno 2 keyword; le altre restano non assegnate.
 * 3. Dentro l'hub, il resto della keyword senza il nucleo: stesso resto in qualunque ordine = varianti della stessa
 *    pagina; resto vuoto = pagina pilastro; stessa categoria di modificatore o, senza modificatori, stessa parola più
 *    pesata dell'hub = stesso spoke. Uno spoke nasce con almeno minKeywordsPerSpoke keyword o minSpokeVolume ricerche,
 *    altrimenti le keyword vanno nella pilastro; oltre maxSpokesPerHub gli spoke a priorità più bassa confluiscono
 *    nella pilastro. Una domanda è uno spoke da questionSpokeVolume ricerche in su (o sempre, con questionsAs spokes),
 *    altrimenti va nella FAQ dello spoke che condivide più parole non modificatore, o della pilastro.
 * 4. Keyword principale: la più cercata, poi il punteggio, poi il testo più corto, poi l'ordine alfabetico (nella
 *    pilastro tra le varianti del nucleo, se ci sono). Priorità della pagina: volume complessivo, o punteggio
 *    complessivo se il perimetro non ha volumi (come D-18). Ordine di lavoro: hub per volume complessivo (pilastro più
 *    spoke), ciascuno seguito dai propri spoke per priorità.
 * 5. Ancore della rigenerazione (T-2502): la keyword principale di un hub ancorato vale come seed (prima delle seed con
 *    lo stesso nucleo). Il suo hub non ha una pagina pilastro nuova: gli spoke che raggiungono le soglie diventano
 *    spoke nuovi dell'hub ancorato, le altre keyword vanno nella sua pagina pilastro se è aperta, altrimenti tra le non
 *    assegnate.
 */

type Item = {
  input: StrategyKeywordInput;
  /** Rango nell'ordine di priorità: ordinare per rank è ordinare per priorità. */
  rank: number;
  tokens: string[];
  words: Set<string>;
};

type Hub = {
  core: Set<string>;
  members: Item[];
  reason: (merged: number, faq: number) => PlanReason;
  /** Hub ancorato della rigenerazione: le sue pagine nuove sono solo spoke (passo 5). */
  anchor: PlanAnchor | null;
};

type DraftPage = {
  kind: "pillar" | "modifier" | "word" | "question";
  category: ModifierCategory | null;
  /** Keyword proprie della pagina: la principale è la prima. */
  own: Item[];
  faq: Item[];
  merged: Item[];
  reason: (faq: number) => PlanReason;
};

type Context = { language: string; usesVolume: boolean };

// Massimo della colonna Int di Postgres: la priorità salvata non lo supera (CWE-190).
const INT4_MAX = 2_147_483_647;
const MIN_TERM_KEYWORDS = 2;
const NUMERIC = /^\p{N}+$/u;

function compareNullableDesc(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

/**
 * Ordine di priorità delle keyword (T-1901, D-35): volume più alto, poi punteggio, poi testo più corto, poi ordine
 * alfabetico della forma canonica (per punti di codice, indipendente dalla lingua del sistema).
 */
export function compareKeywordPriority(
  a: Pick<StrategyKeywordInput, "volume" | "score" | "canonical">,
  b: Pick<StrategyKeywordInput, "volume" | "score" | "canonical">
): number {
  return (
    compareNullableDesc(a.volume, b.volume) ||
    compareNullableDesc(a.score, b.score) ||
    [...a.canonical].length - [...b.canonical].length ||
    (a.canonical < b.canonical ? -1 : a.canonical > b.canonical ? 1 : 0)
  );
}

/** Parole di una forma canonica senza parole vuote, ridotte alla radice. */
export function keywordWords(canonical: string, language: string): Set<string> {
  return new Set(
    canonical
      .split(" ")
      .filter((token) => token && !isStopword(token, language))
      .map((token) => wordStem(token, language))
  );
}

/**
 * Chiave delle varianti di una keyword: le sue parole in qualunque ordine, singolare o plurale. Due keyword con la
 * stessa chiave sono la stessa pagina (T-1901) e danno un solo H2 (T-1902).
 */
export function variantKey(canonical: string, language: string): string {
  return [...keywordWords(canonical, language)].sort().join(" ");
}

const isModifier = (stem: string, context: Context) => modifierCategoryOfStem(stem, context.language) !== null;

function contentWords(words: Iterable<string>, context: Context): Set<string> {
  return new Set([...words].filter((word) => !isModifier(word, context)));
}

function weightOf(item: Item, context: Context): number {
  return context.usesVolume ? (item.input.volume ?? 0) : (item.input.score ?? 0);
}

function pagePriority(items: Item[], context: Context): number {
  const total = items.reduce((sum, item) => sum + weightOf(item, context), 0);
  return Math.min(INT4_MAX, Math.round(total));
}

const byRank = (a: Item, b: Item) => a.rank - b.rank;

/** Motivo di una pagina del piano: codice di STRATEGY_REASON_CODES e parametri del testo tradotto. */
const planReason = (code: StrategyReasonCode, params: ReasonParams): PlanReason => ({ code, params });
const sumVolume = (items: Item[]) => items.reduce((sum, item) => sum + (item.input.volume ?? 0), 0);

/** Testo della parola nella keyword (prima forma con quella radice), per i motivi tradotti. */
function displayWord(item: Item, stem: string, context: Context): string {
  return item.tokens.find((token) => wordStem(token, context.language) === stem) ?? stem;
}

function seedHubs(seeds: string[], anchors: PlanAnchor[], items: Item[], context: Context): { hubs: Hub[]; rest: Item[] } {
  const cores = new Map<string, { label: string; core: Set<string>; anchor: PlanAnchor | null }>();
  const addCore = (label: string, canonical: string, anchor: PlanAnchor | null) => {
    const core = keywordWords(canonical, context.language);
    const key = [...core].sort().join(" ");
    if (core.size > 0 && !cores.has(key)) {
      cores.set(key, { label, core, anchor });
    }
  };
  // Le ancore prima delle seed: a parità di nucleo l'hub resta quello ancorato.
  for (const anchor of [...anchors].sort((a, b) => (a.main < b.main ? -1 : a.main > b.main ? 1 : 0))) {
    addCore(anchor.main, anchor.main, anchor);
  }
  for (const seed of [...seeds].map((value) => value.trim()).filter(Boolean).sort()) {
    addCore(seed, canonicalizeKeyword(seed, context.language), null);
  }
  // Prima i nuclei con più parole, poi in ordine alfabetico: la prima seed contenuta è la più specifica.
  const ordered = [...cores.entries()]
    .sort(([keyA, a], [keyB, b]) => b.core.size - a.core.size || (keyA < keyB ? -1 : 1))
    .map(([, value]) => value);

  const members = new Map(ordered.map((seed) => [seed, [] as Item[]]));
  const rest: Item[] = [];
  for (const item of items) {
    const seed = ordered.find((candidate) => [...candidate.core].every((word) => item.words.has(word)));
    if (seed) members.get(seed)!.push(item);
    else rest.push(item);
  }

  const hubs = ordered
    .filter((seed) => members.get(seed)!.length > 0)
    .map((seed) => ({
      core: seed.core,
      members: members.get(seed)!,
      reason: (merged: number, faq: number) => planReason("HUB_SEED", { seed: seed.label, merged, faq }),
      anchor: seed.anchor,
    }));
  return { hubs, rest };
}

function termHubs(items: Item[], context: Context): { hubs: Hub[]; unassigned: Item[] } {
  const hubs: Hub[] = [];
  let rest = items;
  while (rest.length >= MIN_TERM_KEYWORDS) {
    const weights = new Map<string, { weight: number; count: number }>();
    for (const item of rest) {
      for (const word of contentWords(item.words, context)) {
        if (NUMERIC.test(word)) continue;
        const entry = weights.get(word) ?? { weight: 0, count: 0 };
        entry.weight += weightOf(item, context);
        entry.count += 1;
        weights.set(word, entry);
      }
    }
    const best = [...weights.entries()]
      .filter(([, entry]) => entry.count >= MIN_TERM_KEYWORDS)
      .sort(([wordA, a], [wordB, b]) => b.weight - a.weight || b.count - a.count || (wordA < wordB ? -1 : 1))[0];
    if (!best) break;

    const term = best[0];
    const withTerm = rest.filter((item) => item.words.has(term));
    // Ancora: la keyword con meno parole non modificatore e, a parità, la più prioritaria.
    const anchor = [...withTerm].sort(
      (a, b) => contentWords(a.words, context).size - contentWords(b.words, context).size || a.rank - b.rank
    )[0];
    let core = contentWords(anchor.words, context);
    let members = rest.filter((item) => [...core].every((word) => item.words.has(word)));
    if (members.length < MIN_TERM_KEYWORDS) {
      core = new Set([term]);
      members = withTerm;
    }

    const memberSet = new Set(members);
    rest = rest.filter((item) => !memberSet.has(item));
    hubs.push({
      core,
      members,
      reason: (merged, faq) => planReason("HUB_TERM", { term: anchor.input.keyword, merged, faq }),
      anchor: null,
    });
  }
  return { hubs, unassigned: rest };
}

function remainder(item: Item, core: Set<string>): Set<string> {
  return new Set([...item.words].filter((word) => !core.has(word)));
}

/** Categoria del modificatore del resto (parole singole e sequenze come «vicino a me»), nell'ordine di priorità. */
function categoryOf(rest: Set<string>, item: Item, context: Context): ModifierCategory | null {
  const found = sequenceModifierCategories(item.tokens, context.language);
  for (const word of rest) {
    const category = modifierCategoryOfStem(word, context.language);
    if (category) found.add(category);
  }
  return MODIFIER_CATEGORIES.find((category) => found.has(category)) ?? null;
}

function contentTypeOf(page: DraftPage): StrategyContentType {
  const main = page.own[0];
  const commercial = main.input.searchIntent === "transactional" || main.input.searchIntent === "commercial";
  switch (page.kind) {
    case "question":
      return "faq";
    case "modifier":
      if (page.category === "comparison") {
        return page.own.some((item) => item.input.keywordType === "comparison") ? "comparison" : "list";
      }
      return ({ local: "local", tool: "tool", transactional: "product_category", informational: "guide" } as const)[
        page.category!
      ];
    default:
      return commercial ? "product_category" : "guide";
  }
}

/** Pagina pilastro e spoke di un hub (passo 3). */
function buildHubPages(hub: Hub, rules: StrategyRules, context: Context): DraftPage[] {
  const groups = new Map<string, Item[]>();
  for (const item of hub.members) {
    const key = [...remainder(item, hub.core)].sort().join(" ");
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const wordWeights = new Map<string, { weight: number; count: number }>();
  for (const item of hub.members) {
    for (const word of remainder(item, hub.core)) {
      const entry = wordWeights.get(word) ?? { weight: 0, count: 0 };
      entry.weight += weightOf(item, context);
      entry.count += 1;
      wordWeights.set(word, entry);
    }
  }
  const bestWord = (rest: Set<string>) =>
    [...rest].sort((a, b) => {
      const wa = wordWeights.get(a)!;
      const wb = wordWeights.get(b)!;
      return wb.weight - wa.weight || wb.count - wa.count || (a < b ? -1 : 1);
    })[0];

  const core = groups.get("") ?? [];
  const candidates = new Map<string, DraftPage>();
  const faqGroups: Item[][] = [];
  for (const [key, group] of groups) {
    if (key === "") continue;
    const lead = group[0];
    const rest = remainder(lead, hub.core);
    let candidateKey: string;
    let draft: Omit<DraftPage, "own" | "faq" | "merged">;
    if (lead.input.isQuestion) {
      if (rules.questionsAs === "faq" && sumVolume(group) < rules.questionSpokeVolume) {
        faqGroups.push(group);
        continue;
      }
      const volume = sumVolume(group);
      candidateKey = `q:${key}`;
      draft = { kind: "question", category: null, reason: (faq) => planReason("SPOKE_QUESTION", { volume, faq }) };
    } else {
      const category = categoryOf(rest, lead, context);
      if (category) {
        candidateKey = `mod:${category}`;
        draft = { kind: "modifier", category, reason: (faq) => planReason("SPOKE_MODIFIER", { category, faq }) };
      } else {
        const word = bestWord(rest);
        const shown = displayWord(lead, word, context);
        candidateKey = `word:${word}`;
        draft = { kind: "word", category: null, reason: (faq) => planReason("SPOKE_WORD", { word: shown, faq }) };
      }
    }
    const existing = candidates.get(candidateKey);
    if (existing) existing.own.push(...group);
    else candidates.set(candidateKey, { ...draft, own: [...group], faq: [], merged: [] });
  }

  const merged: Item[] = [];
  const eligible: DraftPage[] = [];
  for (const candidate of candidates.values()) {
    candidate.own.sort(byRank);
    const accepted =
      candidate.kind === "question" ||
      candidate.own.length >= rules.minKeywordsPerSpoke ||
      sumVolume(candidate.own) >= rules.minSpokeVolume;
    if (accepted) eligible.push(candidate);
    else merged.push(...candidate.own);
  }

  const byPriority = (a: DraftPage, b: DraftPage) =>
    pagePriority([...b.own, ...b.faq], context) - pagePriority([...a.own, ...a.faq], context) ||
    (a.own[0].input.canonical < b.own[0].input.canonical ? -1 : 1);
  eligible.sort(byPriority);
  const spokes = eligible.slice(0, rules.maxSpokesPerHub);
  for (const overflow of eligible.slice(rules.maxSpokesPerHub)) {
    merged.push(...overflow.own);
  }

  let pillarOwn = [...core].sort(byRank);
  // Un hub ancorato ha già la sua pagina pilastro: nessuno spoke ne prende il posto (passo 5).
  const free = hub.anchor === null;
  if (free && pillarOwn.length === 0 && spokes.length > 0) {
    // Nessuna variante del nucleo: lo spoke più prioritario diventa la pagina pilastro.
    pillarOwn = spokes.shift()!.own;
  }
  const pillar: DraftPage = {
    kind: "pillar",
    category: null,
    own: pillarOwn,
    faq: [],
    merged: merged.sort(byRank),
    // Sostituito sotto dal motivo dell'hub, quando si conoscono le keyword confluite.
    reason: () => planReason("HUB_SEED", {}),
  };
  if (free && pillar.own.length === 0) {
    pillar.own = pillar.merged;
    pillar.merged = [];
  }

  for (const group of faqGroups) {
    const words = contentWords(remainder(group[0], hub.core), context);
    let target: DraftPage = pillar;
    let bestOverlap = 0;
    for (const spoke of spokes) {
      const spokeWords = new Set(spoke.own.flatMap((item) => [...contentWords(remainder(item, hub.core), context)]));
      const overlap = [...words].filter((word) => spokeWords.has(word)).length;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        target = spoke;
      }
    }
    target.faq.push(...group);
  }
  if (free && pillar.own.length === 0) {
    pillar.own = pillar.faq.sort(byRank);
    pillar.faq = [];
  }

  pillar.reason = (faq) => hub.reason(pillar.merged.length, faq);
  return [pillar, ...spokes.sort(byPriority)];
}

function toPlanPage(page: DraftPage, ref: string, hubRef: string | null, position: number, context: Context): PlanPage {
  const items = [...page.own, ...page.faq, ...page.merged].sort(byRank);
  const main = page.own[0];
  return {
    ref,
    kind: page.kind === "pillar" ? "HUB" : "SPOKE",
    hubRef,
    contentType: contentTypeOf(page),
    priority: pagePriority(items, context),
    position,
    reason: page.reason(page.faq.length),
    main: main.input.canonical,
    secondary: items.filter((item) => item !== main).map((item) => item.input.canonical),
  };
}

/**
 * Piano hub and spoke delle keyword del perimetro (T-1901). Le keyword con la stessa forma canonica contano una volta
 * (la più prioritaria). Ogni keyword compare in al massimo una pagina, ogni pagina ha una sola keyword principale.
 * Con le ancore della rigenerazione (T-2502) le pagine nuove sotto un hub ancorato hanno hubRef uguale al ref
 * dell'ancora e nessuna pagina nuova è la pilastro di un hub ancorato.
 */
export function buildStrategyPlan(params: {
  keywords: StrategyKeywordInput[];
  seeds: string[];
  language: string;
  rules: StrategyRules;
  anchors?: PlanAnchor[];
}): StrategyPlan {
  const { language, rules } = params;
  const sorted = [...params.keywords].sort(compareKeywordPriority);
  const seen = new Set<string>();
  const items: Item[] = [];
  for (const input of sorted) {
    if (seen.has(input.canonical)) continue;
    seen.add(input.canonical);
    const tokens = input.canonical.split(" ").filter(Boolean);
    items.push({ input, rank: items.length, tokens, words: keywordWords(input.canonical, language) });
  }
  const context: Context = { language, usesVolume: items.some((item) => item.input.volume !== null) };

  const seeded = seedHubs(params.seeds, params.anchors ?? [], items, context);
  const termed = termHubs(seeded.rest, context);
  const hubs = [...seeded.hubs, ...termed.hubs].map((hub) => {
    const pages = buildHubPages(hub, rules, context);
    const total = pages.reduce((sum, page) => sum + pagePriority([...page.own, ...page.faq, ...page.merged], context), 0);
    return { pages, total, mainCanonical: hub.anchor?.main ?? pages[0].own[0].input.canonical, anchor: hub.anchor };
  });
  hubs.sort((a, b) => b.total - a.total || (a.mainCanonical < b.mainCanonical ? -1 : 1));

  const pages: PlanPage[] = [];
  const anchored: StrategyPlan["anchored"] = [];
  const unassigned = [...termed.unassigned];
  hubs.forEach((hub, hubIndex) => {
    const { anchor } = hub;
    if (anchor) {
      // Passo 5: solo spoke nuovi sotto l'ancora; le keyword della pilastro vanno nella sua pagina o tra le non assegnate.
      const [pillar, ...spokes] = hub.pages;
      const rest = [...pillar.own, ...pillar.faq, ...pillar.merged];
      if (anchor.open && rest.length > 0) {
        anchored.push({ ref: anchor.ref, secondary: rest.sort(byRank).map((item) => item.input.canonical) });
      } else {
        unassigned.push(...rest);
      }
      spokes.forEach((page, index) => pages.push(toPlanPage(page, `${anchor.ref}s${index + 1}`, anchor.ref, pages.length, context)));
      return;
    }
    const hubRef = `h${hubIndex}`;
    hub.pages.forEach((page, pageIndex) => {
      const ref = pageIndex === 0 ? hubRef : `${hubRef}s${pageIndex}`;
      pages.push(toPlanPage(page, ref, pageIndex === 0 ? null : hubRef, pages.length, context));
    });
  });

  return { pages, unassigned: unassigned.sort(byRank).map((item) => item.input.canonical), anchored };
}
