import { compareKeywordPriority, keywordWords } from "@/lib/modules/strategy/cluster";
import { modifierCategoryOfStem, sequenceModifierCategories } from "@/lib/modules/strategy/modifiers";
import {
  type KeywordClass,
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
 * Motore del piano per risultati di Google (T-6302, D-57): funzione pura, senza I/O, deterministica (stesso piano per
 * qualunque ordine in ingresso). Restituisce lo StrategyPlan del motore di oggi (cluster.ts), che resta la riserva.
 *
 * 1. Keyword per priorità (compareKeywordPriority), una per forma canonica; le competitor vanno tra le non assegnate con
 *    il motivo COMPETITOR, le place aspettano la pagina locale (passo 4).
 * 2. Pagine per intento: la prima keyword non assegnata con risultati apre una pagina e prende le keyword non assegnate
 *    con risultati che hanno almeno serpPageOverlap URL in comune con lei.
 * 3. Hub: le pagine in ordine di priorità; una pagina è spoke della prima pilastro (le ancore della rigenerazione per
 *    prime) di cui la sua keyword principale contiene tutte le parole di contenuto (keywordWords senza modificatori), o
 *    con cui ha almeno serpHubOverlap URL in comune fra le keyword principali; altrimenti apre un hub. La pilastro di un
 *    hub è la sua pagina con meno parole di contenuto e, a parità, priorità più alta.
 * 4. Pagina locale: le keyword place vanno nell'hub della pagina con più URL in comune, altrimenti nell'hub a priorità
 *    più alta, e formano un solo spoke local.
 * 5. Regole di oggi: una domanda sotto questionSpokeVolume (con questionsAs faq) va nelle FAQ della pagina con più URL in
 *    comune; uno spoke sotto minKeywordsPerSpoke e minSpokeVolume, e oltre maxSpokesPerHub quelli a priorità più bassa,
 *    confluisce nella pagina dello stesso hub con più URL in comune, altrimenti nella pilastro.
 * 6. Keyword senza risultati: nella pagina con più parole di contenuto in comune con la keyword principale (almeno una),
 *    altrimenti tra le non assegnate.
 * 7. Ancore (T-2502): un hub ancorato non ha una pilastro nuova; le sue pagine sono spoke nuovi dell'ancora e le keyword
 *    che andrebbero nella pilastro vanno nella pagina ancorata se è aperta, altrimenti tra le non assegnate.
 */

type Entry = {
  input: StrategyKeywordInput;
  /** Rango nell'ordine di priorità: ordinare per rank è ordinare per priorità. */
  rank: number;
  tokens: string[];
  words: Set<string>;
  /** Parole senza modificatori. */
  content: Set<string>;
  urls: Set<string>;
};

type Draft = {
  kind: "intent" | "question" | "local";
  /** Keyword della pagina: la principale è la prima. */
  own: Entry[];
  faq: Entry[];
  /** Keyword di pagine confluite (sotto soglia o oltre il massimo di spoke). */
  merged: Entry[];
  /** Keyword senza risultati assegnate per parole in comune. */
  extra: Entry[];
  urls: Set<string>;
};

type Hub = {
  anchor: PlanAnchor | null;
  /** Riferimento delle regole dell'hub: la keyword principale della pagina che l'ha aperto o dell'ancora. */
  refContent: Set<string>;
  refUrls: Set<string>;
  pages: Draft[];
  places: Entry[];
  pillar: Draft | null;
  spokes: Draft[];
  /** Keyword per la pagina pilastro di un hub ancorato. */
  toAnchor: Entry[];
};

type Context = { language: string; usesVolume: boolean };

export type SerpPlanParams = {
  keywords: StrategyKeywordInput[];
  /** URL dei primi 10 risultati organici per forma canonica; le keyword assenti non hanno risultati. */
  serps: Map<string, string[]>;
  /** Classi di T-6301 per forma canonica; le assenti sono other. */
  classes: Map<string, KeywordClass>;
  language: string;
  rules: StrategyRules;
  anchors?: PlanAnchor[];
};

// Massimo della colonna Int di Postgres: la priorità salvata non lo supera (CWE-190).
const INT4_MAX = 2_147_483_647;

const byRank = (a: Entry, b: Entry) => a.rank - b.rank;
const byCanonical = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function overlap(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const value of a) if (b.has(value)) count += 1;
  return count;
}

function withoutModifiers(words: Set<string>, language: string): Set<string> {
  return new Set([...words].filter((word) => modifierCategoryOfStem(word, language) === null));
}

const weight = (entry: Entry, context: Context) => (context.usesVolume ? (entry.input.volume ?? 0) : (entry.input.score ?? 0));
const totalOf = (entries: Entry[], context: Context) => Math.min(INT4_MAX, Math.round(entries.reduce((sum, entry) => sum + weight(entry, context), 0)));
const volumeOf = (entries: Entry[]) => entries.reduce((sum, entry) => sum + (entry.input.volume ?? 0), 0);
const entriesOf = (draft: Draft) => [...draft.own, ...draft.faq, ...draft.merged, ...draft.extra];

function draftOf(kind: Draft["kind"], own: Entry[]): Draft {
  return { kind, own, faq: [], merged: [], extra: [], urls: new Set(own.flatMap((entry) => [...entry.urls])) };
}

/** Categoria del modificatore della keyword principale, nell'ordine di MODIFIER_CATEGORIES. */
function mainCategory(entry: Entry, language: string): ModifierCategory | null {
  const categories = sequenceModifierCategories(entry.tokens, language);
  for (const word of entry.words) {
    const category = modifierCategoryOfStem(word, language);
    if (category) categories.add(category);
  }
  return MODIFIER_CATEGORIES.find((category) => categories.has(category)) ?? null;
}

const BY_CATEGORY: Record<Exclude<ModifierCategory, "comparison">, StrategyContentType> = {
  local: "local",
  tool: "tool",
  transactional: "product_category",
  informational: "guide",
};

function contentTypeOf(draft: Draft, pillar: boolean, language: string): StrategyContentType {
  if (draft.kind === "local") return "local";
  if (draft.kind === "question" && !pillar) return "faq";
  const main = draft.own[0];
  const fallback: StrategyContentType = ["transactional", "commercial"].includes(main.input.searchIntent) ? "product_category" : "guide";
  const category = pillar ? null : mainCategory(main, language);
  if (category === "comparison") return draft.own.some((entry) => entry.input.keywordType === "comparison") ? "comparison" : "list";
  return category ? BY_CATEGORY[category] : fallback;
}

/** Motivo di una pagina: codice di STRATEGY_REASON_CODES e parametri del testo tradotto. */
const reasonFor = (code: StrategyReasonCode, params: ReasonParams): PlanReason => ({ code, params });

function reasonOf(draft: Draft, pillar: boolean): PlanReason {
  const faq = draft.faq.length;
  if (pillar) return reasonFor("HUB_SERP", { keyword: draft.own[0].input.keyword, merged: draft.merged.length, faq });
  if (draft.kind === "local") return reasonFor("SPOKE_LOCAL", { count: draft.own.length, faq });
  if (draft.kind === "question") return reasonFor("SPOKE_QUESTION", { volume: volumeOf(draft.own), faq });
  return reasonFor("SPOKE_SERP", { count: draft.own.length, faq });
}

/** La pagina fra i bersagli con più URL in comune (almeno uno), a parità la prima; null se nessuna ne ha. */
function closestByUrls(urls: Set<string>, targets: Draft[]): Draft | null {
  let best: Draft | null = null;
  let bestOverlap = 0;
  for (const target of targets) {
    const value = overlap(urls, target.urls);
    if (value > bestOverlap) {
      best = target;
      bestOverlap = value;
    }
  }
  return best;
}

/** Passo 2: pagine per intento delle keyword con risultati, nell'ordine di priorità. */
function intentPages(entries: Entry[], rules: StrategyRules): Draft[] {
  const pages: Draft[] = [];
  const taken = new Set<Entry>();
  for (const lead of entries) {
    if (taken.has(lead)) continue;
    const own = entries.filter((entry) => !taken.has(entry) && (entry === lead || overlap(lead.urls, entry.urls) >= rules.serpPageOverlap));
    for (const entry of own) taken.add(entry);
    pages.push(draftOf(lead.input.isQuestion ? "question" : "intent", own));
  }
  return pages;
}

/** Passo 3: hub delle pagine, con le ancore per prime, e pilastro di ogni hub nuovo. */
function formHubs(pages: Draft[], anchors: PlanAnchor[], params: SerpPlanParams, context: Context): Hub[] {
  const emptyHub = (anchor: PlanAnchor | null, refContent: Set<string>, refUrls: Set<string>): Hub => ({
    anchor,
    refContent,
    refUrls,
    pages: [],
    places: [],
    pillar: null,
    spokes: [],
    toAnchor: [],
  });
  const hubs = [...anchors]
    .sort((a, b) => byCanonical(a.main, b.main))
    .map((anchor) =>
      emptyHub(anchor, withoutModifiers(keywordWords(anchor.main, context.language), context.language), new Set(params.serps.get(anchor.main) ?? []))
    );
  const joins = (hub: Hub, main: Entry) =>
    (hub.refContent.size > 0 && [...hub.refContent].every((word) => main.words.has(word))) ||
    overlap(hub.refUrls, main.urls) >= params.rules.serpHubOverlap;
  for (const page of pages) {
    const main = page.own[0];
    const hub = hubs.find((candidate) => joins(candidate, main));
    if (hub) {
      hub.pages.push(page);
    } else {
      const opened = emptyHub(null, main.content, main.urls);
      opened.pages.push(page);
      hubs.push(opened);
    }
  }
  for (const hub of hubs) {
    if (hub.anchor) {
      hub.spokes = [...hub.pages];
      continue;
    }
    const pillar = hub.pages.reduce((best, page) => (page.own[0].content.size < best.own[0].content.size ? page : best));
    hub.pillar = pillar;
    hub.spokes = hub.pages.filter((page) => page !== pillar);
  }
  return hubs;
}

/** Passo 5: domande nelle FAQ, pagina locale, soglie e massimo di spoke; restituisce gli spoke tenuti per priorità. */
function settleHub(hub: Hub, rules: StrategyRules, byPriority: (a: Draft, b: Draft) => number): Draft[] {
  const toPillar = (entries: Entry[], into: "faq" | "merged") => {
    if (hub.pillar) hub.pillar[into].push(...entries);
    else hub.toAnchor.push(...entries);
  };
  const faqQuestions = hub.spokes.filter(
    (page) => page.kind === "question" && rules.questionsAs === "faq" && volumeOf(page.own) < rules.questionSpokeVolume
  );
  const candidates = hub.spokes.filter((page) => !faqQuestions.includes(page));
  if (hub.places.length > 0) candidates.push(draftOf("local", [...hub.places].sort(byRank)));

  const accepted = (page: Draft) =>
    page.kind === "question" || page.own.length >= rules.minKeywordsPerSpoke || volumeOf(page.own) >= rules.minSpokeVolume;
  const eligible = candidates.filter(accepted).sort(byPriority);
  const kept = eligible.slice(0, rules.maxSpokesPerHub);
  const dropped = [...candidates.filter((page) => !accepted(page)), ...eligible.slice(rules.maxSpokesPerHub)];
  const targets = hub.pillar ? [hub.pillar, ...kept] : kept;

  for (const page of dropped) {
    const target = closestByUrls(page.urls, targets);
    if (target) target.merged.push(...page.own);
    else toPillar(page.own, "merged");
  }
  for (const question of faqQuestions) {
    const target = closestByUrls(question.urls, targets);
    if (target) target.faq.push(...question.own);
    else toPillar(question.own, "faq");
  }
  return kept;
}

/**
 * Piano per risultati di Google delle keyword del perimetro (T-6302): ogni keyword compare in al massimo una pagina, ogni
 * pagina ha una sola keyword principale; le keyword non assegnate hanno il motivo in unassignedReasons.
 */
export function buildSerpPlan(params: SerpPlanParams): StrategyPlan {
  const { language, rules } = params;
  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const input of [...params.keywords].sort(compareKeywordPriority)) {
    if (seen.has(input.canonical)) continue;
    seen.add(input.canonical);
    const words = keywordWords(input.canonical, language);
    entries.push({
      input,
      rank: entries.length,
      tokens: input.canonical.split(" ").filter(Boolean),
      words,
      content: withoutModifiers(words, language),
      urls: new Set(params.serps.get(input.canonical) ?? []),
    });
  }
  const context: Context = { language, usesVolume: entries.some((entry) => entry.input.volume !== null) };
  const classOf = (entry: Entry) => params.classes.get(entry.input.canonical) ?? "other";

  const unassigned: Entry[] = [];
  const unassignedReasons: NonNullable<StrategyPlan["unassignedReasons"]> = {};
  const leaveOut = (entry: Entry, why: "COMPETITOR" | "UNASSIGNED") => {
    unassigned.push(entry);
    unassignedReasons[entry.input.canonical] = why;
  };
  for (const entry of entries.filter((item) => classOf(item) === "competitor")) leaveOut(entry, "COMPETITOR");
  const places = entries.filter((entry) => classOf(entry) === "place");
  const others = entries.filter((entry) => classOf(entry) === "other");

  const byPriority = (a: Draft, b: Draft) =>
    totalOf(entriesOf(b), context) - totalOf(entriesOf(a), context) || byCanonical(a.own[0].input.canonical, b.own[0].input.canonical);
  const pages = intentPages(
    others.filter((entry) => entry.urls.size > 0),
    rules
  ).sort(byPriority);
  const hubs = formHubs(pages, params.anchors ?? [], params, context);
  const hubTotal = (hub: Hub) => hub.pages.reduce((sum, page) => sum + totalOf(page.own, context), 0);
  const hubMain = (hub: Hub) => hub.anchor?.main ?? hub.pillar!.own[0].input.canonical;
  const byHubPriority = (a: Hub, b: Hub) => hubTotal(b) - hubTotal(a) || byCanonical(hubMain(a), hubMain(b));

  // Passo 4: ogni luogo nell'hub della pagina con più URL in comune, altrimenti nell'hub a priorità più alta.
  const ranked = [...hubs].sort(byHubPriority);
  for (const place of places) {
    let best: Hub | null = null;
    let bestOverlap = 0;
    for (const hub of ranked) {
      const value = Math.max(overlap(place.urls, hub.refUrls), ...hub.pages.map((page) => overlap(place.urls, page.urls)));
      if (value > bestOverlap) {
        best = hub;
        bestOverlap = value;
      }
    }
    const hub = best ?? ranked[0];
    if (hub) hub.places.push(place);
    else leaveOut(place, "UNASSIGNED");
  }

  const kept = new Map(hubs.map((hub) => [hub, settleHub(hub, rules, byPriority)]));

  // Passo 6: le keyword senza risultati nella pagina con più parole di contenuto in comune con la principale.
  const targets: { content: Set<string>; take: (entry: Entry) => void }[] = [];
  for (const hub of [...hubs].sort(byHubPriority)) {
    if (hub.pillar) {
      const pillar = hub.pillar;
      targets.push({ content: pillar.own[0].content, take: (entry) => pillar.extra.push(entry) });
    } else if (hub.anchor?.open) {
      const anchorContent = withoutModifiers(keywordWords(hub.anchor.main, language), language);
      targets.push({ content: anchorContent, take: (entry) => hub.toAnchor.push(entry) });
    }
    for (const spoke of kept.get(hub)!) targets.push({ content: spoke.own[0].content, take: (entry) => spoke.extra.push(entry) });
  }
  for (const entry of others.filter((item) => item.urls.size === 0)) {
    let best: (typeof targets)[number] | null = null;
    let bestOverlap = 0;
    for (const target of targets) {
      const value = overlap(entry.content, target.content);
      if (value > bestOverlap) {
        best = target;
        bestOverlap = value;
      }
    }
    if (best) best.take(entry);
    else leaveOut(entry, "UNASSIGNED");
  }

  const planPages: PlanPage[] = [];
  const anchored: StrategyPlan["anchored"] = [];
  const toPlanPage = (draft: Draft, ref: string, hubRef: string | null): PlanPage => {
    const items = entriesOf(draft).sort(byRank);
    const main = draft.own[0];
    const pillar = hubRef === null;
    return {
      ref,
      kind: pillar ? "HUB" : "SPOKE",
      hubRef,
      contentType: contentTypeOf(draft, pillar, language),
      priority: totalOf(items, context),
      position: planPages.length,
      reason: reasonOf(draft, pillar),
      main: main.input.canonical,
      secondary: items.filter((item) => item !== main).map((item) => item.input.canonical),
    };
  };
  const finalTotal = (hub: Hub) =>
    [...(hub.pillar ? [hub.pillar] : []), ...kept.get(hub)!].reduce((sum, page) => sum + totalOf(entriesOf(page), context), 0);
  const ordered = [...hubs].sort((a, b) => finalTotal(b) - finalTotal(a) || byCanonical(hubMain(a), hubMain(b)));
  ordered.forEach((hub, hubIndex) => {
    const spokes = kept.get(hub)!.sort(byPriority);
    const { anchor } = hub;
    if (anchor) {
      if (anchor.open && hub.toAnchor.length > 0) {
        anchored.push({ ref: anchor.ref, secondary: hub.toAnchor.sort(byRank).map((entry) => entry.input.canonical) });
      } else {
        for (const entry of hub.toAnchor) leaveOut(entry, "UNASSIGNED");
      }
      spokes.forEach((page, index) => planPages.push(toPlanPage(page, `${anchor.ref}s${index + 1}`, anchor.ref)));
      return;
    }
    const hubRef = `h${hubIndex}`;
    planPages.push(toPlanPage(hub.pillar!, hubRef, null));
    spokes.forEach((page, index) => planPages.push(toPlanPage(page, `${hubRef}s${index + 1}`, hubRef)));
  });

  return {
    pages: planPages,
    unassigned: unassigned.sort(byRank).map((entry) => entry.input.canonical),
    anchored,
    unassignedReasons,
  };
}
