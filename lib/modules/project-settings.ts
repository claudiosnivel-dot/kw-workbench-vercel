import { z } from "zod";
import {
  isSupportedCountryCode,
  isSupportedLanguageCode,
  normalizeCountryCode,
  normalizeLanguageCode,
} from "@/lib/constants/locale-options";
import { ArticleTone, AutocompleteProvider, MetricsProvider } from "@/lib/generated/prisma/enums";
import { AppError, ValidationError } from "@/lib/http/errors";
import { QUICK_START_MAX_TOPICS, splitQuickStartTopics } from "@/lib/modules/quick-start-topics";
import { parseBooleanWord, splitLines } from "@/lib/utils";

export type EffectiveProjectSettings = {
  language_code: string;
  country_code: string;
  autocomplete_provider: AutocompleteProvider;
  metrics_provider: MetricsProvider;
  min_volume: number;
  exclude_brands: boolean;
  expand_alpha: boolean;
  expand_numeric: boolean;
  expand_patterns: boolean;
  auto_classification: boolean;
  scoring_profile: string;
};

// Limiti degli input di progetti e sezioni (T-809, D-24).
const NAME_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 1000;
const SEED_MAX_LENGTH = 200;
const SEEDS_PER_REQUEST_MAX = 500;
const SITE_URL_MAX_LENGTH = 300;
// Massimo della colonna Int di Postgres: oltre, la query fallirebbe con un 500 (CWE-190).
const INT4_MAX = 2_147_483_647;

const SCORING_PROFILES = ["balanced", "conservative", "aggressive"] as const;
const AUTOCOMPLETE_PROVIDERS = ["MOCK", "GOOGLE_DIRECT"] as const;
const METRICS_PROVIDERS = ["NONE", "MOCK", "DATAFORSEO"] as const;

/** Override: '' o null significano «eredita dal progetto» e diventano null. */
function inheritable<T extends z.ZodType>(schema: T) {
  return z
    .union([z.null(), z.literal(""), schema])
    .transform((value) => (value === "" || value === null ? null : (value as z.output<T>)));
}

const nameField = z
  .string()
  .trim()
  .min(1, `da 1 a ${NAME_MAX_LENGTH} caratteri`)
  .max(NAME_MAX_LENGTH, `da 1 a ${NAME_MAX_LENGTH} caratteri`);
// Solo i valori di lib/constants/locale-options.ts, salvati nella forma normalizzata.
const languageField = z
  .string()
  .trim()
  .refine(isSupportedLanguageCode, "lingua non supportata")
  .transform((code) => normalizeLanguageCode(code));
const countryField = z
  .string()
  .trim()
  .refine(isSupportedCountryCode, "paese non supportato")
  .transform((code) => normalizeCountryCode(code));
const minVolumeField = z
  .union([z.number(), z.string().trim()])
  .transform(Number)
  .pipe(
    z
      .number()
      .int(`intero tra 0 e ${INT4_MAX}`)
      .min(0, `intero tra 0 e ${INT4_MAX}`)
      .max(INT4_MAX, `intero tra 0 e ${INT4_MAX}`)
  );
const booleanField = z.union([z.boolean(), z.number(), z.string()]).transform((value, ctx) => {
  const parsed = parseBooleanWord(typeof value === "boolean" ? value : String(value).trim());
  if (parsed === undefined) {
    ctx.addIssue({ code: "custom", message: "atteso true/false, 1/0, yes/no oppure on/off" });
    return z.NEVER;
  }
  return parsed;
});
const booleanOverrideField = z
  .union([z.null(), z.literal(""), z.literal("inherit"), booleanField])
  .transform((value) => (value === null || value === "" || value === "inherit" ? null : value));
const seedsField = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => Array.from(new Set(splitLines(Array.isArray(value) ? value.join("\n") : value))))
  .refine((seeds) => seeds.length <= SEEDS_PER_REQUEST_MAX, `al massimo ${SEEDS_PER_REQUEST_MAX} seed per richiesta`)
  .refine(
    (seeds) => seeds.every((seed) => seed.length <= SEED_MAX_LENGTH),
    `ogni seed al massimo ${SEED_MAX_LENGTH} caratteri`
  );

const projectFields = {
  name: nameField,
  language_code: languageField,
  country_code: countryField,
  autocomplete_provider: z.enum(AUTOCOMPLETE_PROVIDERS),
  metrics_provider: z.enum(METRICS_PROVIDERS),
  min_volume: minVolumeField,
  exclude_brands: booleanField,
  expand_alpha: booleanField,
  expand_numeric: booleanField,
  expand_patterns: booleanField,
  auto_classification: booleanField,
  scoring_profile: z.enum(SCORING_PROFILES),
};

// Schemi strict: un campo non dichiarato (workspace_id, default_subproject_id, id...) è un 400 (CWE-915).
const projectCreateSchema = z
  .strictObject({
    ...projectFields,
    seeds: seedsField,
    initial_subproject_name: nameField,
    createInitialSection: z.boolean(),
  })
  .partial();
/** Testo facoltativo della scheda: spazi ai lati tolti, '' e null diventano null, al massimo max caratteri. */
function optionalText(max: number) {
  return z
    .union([z.null(), z.string().trim().max(max, `al massimo ${max} caratteri`)])
    .transform((value) => (value === "" ? null : value));
}

/**
 * Indirizzo del sito (T-4001): assoluto in https, senza credenziali, query o frammento, salvato senza barra finale.
 * Serve solo a scrivere i link degli articoli: l'app non lo chiama mai (CWE-918).
 */
function parseSiteUrl(value: string, ctx: z.RefinementCtx): string {
  const invalid = () => {
    ctx.addIssue({ code: "custom", message: "indirizzo https assoluto, senza credenziali, query o frammento" });
    return z.NEVER;
  };
  if (!URL.canParse(value) || /[?#]/.test(value)) return invalid();
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return invalid();
  const normalized = `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  if (normalized.length > SITE_URL_MAX_LENGTH) {
    ctx.addIssue({ code: "custom", message: `al massimo ${SITE_URL_MAX_LENGTH} caratteri` });
    return z.NEVER;
  }
  return normalized;
}

// Scheda «Per gli articoli» (T-4001, D-46): solo nella PATCH, con i limiti delle colonne della migrazione 0049.
const articleBriefFields = {
  article_about: optionalText(1000),
  article_audience: optionalText(300),
  article_tone: z.enum(ArticleTone),
  business_name: optionalText(120),
  business_address: optionalText(300),
  site_url: z
    .union([z.null(), z.string().trim()])
    .transform((value, ctx) => (value === null || value === "" ? null : parseSiteUrl(value, ctx))),
};

const projectPatchSchema = z.strictObject({ ...projectFields, ...articleBriefFields }).partial();

const subprojectFields = {
  name: nameField,
  description: inheritable(
    z.string().trim().max(DESCRIPTION_MAX_LENGTH, `al massimo ${DESCRIPTION_MAX_LENGTH} caratteri`)
  ),
  seeds: seedsField,
  language_code_override: inheritable(languageField),
  country_code_override: inheritable(countryField),
  autocomplete_provider_override: inheritable(z.enum(AUTOCOMPLETE_PROVIDERS)),
  metrics_provider_override: inheritable(z.enum(METRICS_PROVIDERS)),
  min_volume_override: inheritable(minVolumeField),
  exclude_brands_override: booleanOverrideField,
  expand_alpha_override: booleanOverrideField,
  expand_numeric_override: booleanOverrideField,
  expand_patterns_override: booleanOverrideField,
  auto_classification_override: booleanOverrideField,
  scoring_profile_override: inheritable(z.enum(SCORING_PROFILES)),
};
const subprojectCreateSchema = z.strictObject(subprojectFields).partial();
const subprojectPatchSchema = z.strictObject(subprojectFields).partial();

// Campi con cui un client proverebbe a scegliersi piano o limiti (T-1605): ignorati, mai un 400 né un effetto; i
// diritti arrivano solo da getEntitlements lato server (CWE-602).
const CLIENT_ENTITLEMENT_FIELDS = new Set(["plan", "limits", "entitlements"]);

function withoutEntitlementFields(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !CLIENT_ENTITLEMENT_FIELDS.has(key)));
}

/** Primo problema dello schema come 400 VALIDATION_ERROR con il nome del campo (formato di T-503). */
function parseOrThrow<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(withoutEntitlementFields(payload));
  if (result.success) {
    return result.data;
  }

  const issue = result.error.issues[0];
  if (issue.code === "unrecognized_keys") {
    throw new ValidationError(`Campo non ammesso: ${issue.keys.join(", ")}`);
  }
  const field = issue.path.map(String).join(".") || "body";
  throw new ValidationError(`Valore non valido per ${field}: ${issue.message}`);
}

type Actor = { isRootAdmin: boolean };

/**
 * MOCK produce volumi finti e si sceglie solo come root admin (D-24, CWE-284); chi lo ha già lo conserva. DATAFORSEO,
 * che ha un costo per richiesta, lo regola il diritto licensedMetrics del piano (T-1605, assertLicensedMetricsChoice di
 * lib/billing/enforce.ts), chiamato dalle rotte dopo il parse.
 */
function assertMetricsProviderAllowed(
  value: MetricsProvider | null | undefined,
  current: MetricsProvider | null | undefined,
  actor: Actor
): void {
  if (value === "MOCK" && value !== current && !actor.isRootAdmin) {
    throw new AppError(403, "FORBIDDEN_FIELD", "Il provider di metriche MOCK è riservato all'amministratore principale");
  }
}

export type ProjectCreateInput = {
  data: {
    name: string;
    language_code: string;
    country_code: string;
    autocomplete_provider: AutocompleteProvider;
    metrics_provider: MetricsProvider;
    min_volume: number;
    exclude_brands: boolean;
    expand_alpha: boolean;
    expand_numeric: boolean;
    expand_patterns: boolean;
    auto_classification: boolean;
    scoring_profile: string;
  };
  seeds: string[];
  initialSubprojectName: string;
  createInitialSection: boolean;
};

export function parseProjectCreate(payload: unknown, actor: Actor): ProjectCreateInput {
  const input = parseOrThrow(projectCreateSchema, payload);
  assertMetricsProviderAllowed(input.metrics_provider, undefined, actor);

  return {
    data: {
      name: input.name ?? "Progetto senza nome",
      language_code: input.language_code ?? "en",
      country_code: input.country_code ?? "US",
      // Regola invariata: solo il root admin sceglie il provider di autocomplete.
      autocomplete_provider: actor.isRootAdmin ? (input.autocomplete_provider ?? "GOOGLE_DIRECT") : "GOOGLE_DIRECT",
      metrics_provider: input.metrics_provider ?? "NONE",
      min_volume: input.min_volume ?? 0,
      exclude_brands: input.exclude_brands ?? true,
      expand_alpha: input.expand_alpha ?? true,
      expand_numeric: input.expand_numeric ?? true,
      expand_patterns: input.expand_patterns ?? true,
      auto_classification: input.auto_classification ?? true,
      scoring_profile: input.scoring_profile ?? "balanced",
    },
    seeds: input.seeds ?? [],
    initialSubprojectName: input.initial_subproject_name ?? "Generale",
    createInitialSection: input.createInitialSection ?? true,
  };
}

// Avvio rapido (T-2301, T-3701): il topic si divide sulle virgole in voci, ognuna una seed dell'argomento con il limite
// delle seed (D-24); da 1 a 5 voci dopo aver tolto vuote e doppioni (splitQuickStartTopics).
const quickStartSchema = z
  .strictObject({
    topic: z
      .string()
      .transform(splitQuickStartTopics)
      .pipe(
        z
          .array(z.string().max(SEED_MAX_LENGTH, `ogni voce da 1 a ${SEED_MAX_LENGTH} caratteri`))
          .min(1, `da 1 a ${QUICK_START_MAX_TOPICS} voci separate da virgola`)
          .max(QUICK_START_MAX_TOPICS, `da 1 a ${QUICK_START_MAX_TOPICS} voci separate da virgola`)
      ),
    languageCode: languageField.optional(),
    countryCode: countryField.optional(),
  })
  .transform(({ topic, ...rest }) => ({ ...rest, seeds: topic }));

export type QuickStartInput = z.output<typeof quickStartSchema>;

/** Corpo di POST /api/projects/quick-start: topic obbligatorio (le voci diventano seeds), lingua e paese facoltativi validati come nel progetto. */
export function parseQuickStart(payload: unknown): QuickStartInput {
  return parseOrThrow(quickStartSchema, payload);
}

/** Nome del progetto e del primo argomento dall'avvio rapido: la prima voce con l'iniziale maiuscola, al massimo 120 caratteri. */
export function quickStartName(topic: string): string {
  return `${topic.slice(0, 1).toUpperCase()}${topic.slice(1)}`.slice(0, NAME_MAX_LENGTH).trim();
}

/** Aggiornamento parziale del progetto: nel data ci sono solo i campi inviati. */
export function parseProjectPatch(payload: unknown, actor: Actor, current: { metrics_provider: MetricsProvider }) {
  const input = parseOrThrow(projectPatchSchema, payload);
  assertMetricsProviderAllowed(input.metrics_provider, current.metrics_provider, actor);
  if (input.autocomplete_provider !== undefined && !actor.isRootAdmin) {
    input.autocomplete_provider = "GOOGLE_DIRECT";
  }
  return input;
}

export function parseSubprojectCreate(payload: unknown, actor: Actor) {
  const { seeds, ...input } = parseOrThrow(subprojectCreateSchema, payload);
  assertMetricsProviderAllowed(input.metrics_provider_override, null, actor);

  return {
    data: {
      name: input.name ?? "Generale",
      description: input.description ?? null,
      language_code_override: input.language_code_override ?? null,
      country_code_override: input.country_code_override ?? null,
      autocomplete_provider_override: actor.isRootAdmin ? (input.autocomplete_provider_override ?? null) : null,
      metrics_provider_override: input.metrics_provider_override ?? null,
      min_volume_override: input.min_volume_override ?? null,
      exclude_brands_override: input.exclude_brands_override ?? null,
      expand_alpha_override: input.expand_alpha_override ?? null,
      expand_numeric_override: input.expand_numeric_override ?? null,
      expand_patterns_override: input.expand_patterns_override ?? null,
      auto_classification_override: input.auto_classification_override ?? null,
      scoring_profile_override: input.scoring_profile_override ?? null,
    },
    seeds: seeds ?? [],
  };
}

/** Aggiornamento parziale della sezione: seeds assente lascia le seed, seeds vuoto le cancella. */
export function parseSubprojectPatch(
  payload: unknown,
  actor: Actor,
  current: { metrics_provider_override: MetricsProvider | null }
) {
  const { seeds, ...data } = parseOrThrow(subprojectPatchSchema, payload);
  assertMetricsProviderAllowed(data.metrics_provider_override, current.metrics_provider_override, actor);
  if (data.autocomplete_provider_override !== undefined && !actor.isRootAdmin) {
    data.autocomplete_provider_override = null;
  }
  return { data, seeds };
}

export function resolveEffectiveProjectSettings(input: {
  project: {
    language_code: string;
    country_code: string;
    autocomplete_provider: AutocompleteProvider;
    metrics_provider: MetricsProvider;
    min_volume: number;
    exclude_brands: boolean;
    expand_alpha: boolean;
    expand_numeric: boolean;
    expand_patterns: boolean;
    auto_classification: boolean;
    scoring_profile: string;
  };
  subproject?: {
    language_code_override: string | null;
    country_code_override: string | null;
    autocomplete_provider_override: AutocompleteProvider | null;
    metrics_provider_override: MetricsProvider | null;
    min_volume_override: number | null;
    exclude_brands_override: boolean | null;
    expand_alpha_override: boolean | null;
    expand_numeric_override: boolean | null;
    expand_patterns_override: boolean | null;
    auto_classification_override: boolean | null;
    scoring_profile_override: string | null;
  } | null;
}): EffectiveProjectSettings {
  const subproject = input.subproject;

  return {
    language_code: subproject?.language_code_override ?? input.project.language_code,
    country_code: subproject?.country_code_override ?? input.project.country_code,
    autocomplete_provider: subproject?.autocomplete_provider_override ?? input.project.autocomplete_provider,
    metrics_provider: subproject?.metrics_provider_override ?? input.project.metrics_provider,
    min_volume: subproject?.min_volume_override ?? input.project.min_volume,
    exclude_brands: subproject?.exclude_brands_override ?? input.project.exclude_brands,
    expand_alpha: subproject?.expand_alpha_override ?? input.project.expand_alpha,
    expand_numeric: subproject?.expand_numeric_override ?? input.project.expand_numeric,
    expand_patterns: subproject?.expand_patterns_override ?? input.project.expand_patterns,
    auto_classification: subproject?.auto_classification_override ?? input.project.auto_classification,
    scoring_profile: subproject?.scoring_profile_override ?? input.project.scoring_profile,
  };
}
