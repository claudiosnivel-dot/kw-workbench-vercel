import { AutocompleteProvider, MetricsProvider } from "@/lib/generated/prisma/enums";
import { normalizeCountryCode, normalizeLanguageCode } from "@/lib/constants/locale-options";
import { splitLines } from "@/lib/utils";

export type ProjectDefaultsInput = {
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

export type ProjectSettingsInput = ProjectDefaultsInput & {
  seeds: string[];
  initial_subproject_name: string;
};

export type SubprojectSettingsInput = {
  name: string;
  description: string | null;
  seeds: string[];
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
};

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

/** GOOGLE_KEYWORD_PLANNER non si può scegliere come nuovo valore (T-304, D-09): le rotte rispondono 400. */
export class MetricsProviderUnavailableError extends Error {
  readonly code = "METRICS_PROVIDER_UNAVAILABLE";

  constructor() {
    super("Volumi Google Ads non disponibili: il provider Google Keyword Planner non si può più selezionare");
    this.name = "MetricsProviderUnavailableError";
  }

  /** Corpo della risposta 400 delle rotte. */
  get body() {
    return { error: this.message, code: this.code };
  }
}

export function parseProjectPayload(payload: Record<string, unknown>): ProjectSettingsInput {
  const seedInput = String(payload.seeds ?? "");
  const seeds = Array.from(new Set(splitLines(seedInput))).slice(0, 500);

  return {
    ...parseProjectDefaultsPayload(payload),
    seeds,
    initial_subproject_name: parseSubprojectName(payload.initial_subproject_name),
  };
}

/** currentMetricsProvider: valore salvato del progetto in modifica, assente in creazione. */
export function parseProjectDefaultsPayload(
  payload: Record<string, unknown>,
  currentMetricsProvider?: MetricsProvider
): ProjectDefaultsInput {
  return {
    name: String(payload.name ?? "Progetto senza nome").trim() || "Progetto senza nome",
    language_code: normalizeLanguageCode(payload.language_code, "en"),
    country_code: normalizeCountryCode(payload.country_code, "US"),
    autocomplete_provider: parseAutocompleteProvider(payload.autocomplete_provider),
    metrics_provider: parseMetricsProvider(payload.metrics_provider, currentMetricsProvider),
    min_volume: parseNonNegativeInt(payload.min_volume, 0),
    exclude_brands: parseBoolean(payload.exclude_brands, true),
    expand_alpha: parseBoolean(payload.expand_alpha, true),
    expand_numeric: parseBoolean(payload.expand_numeric, true),
    expand_patterns: parseBoolean(payload.expand_patterns, true),
    auto_classification: parseBoolean(payload.auto_classification, true),
    scoring_profile: String(payload.scoring_profile ?? "balanced").trim() || "balanced",
  };
}

export function parseSubprojectPayload(payload: Record<string, unknown>): SubprojectSettingsInput {
  const seedInput = String(payload.seeds ?? "");
  const seeds = Array.from(new Set(splitLines(seedInput))).slice(0, 500);

  return {
    name: parseSubprojectName(payload.name),
    description: parseOptionalText(payload.description),
    seeds,
    language_code_override: parseOptionalLanguage(payload.language_code_override),
    country_code_override: parseOptionalCountry(payload.country_code_override),
    autocomplete_provider_override: parseOptionalAutocompleteProvider(payload.autocomplete_provider_override),
    metrics_provider_override: parseOptionalMetricsProvider(payload.metrics_provider_override),
    min_volume_override: parseOptionalNonNegativeInt(payload.min_volume_override),
    exclude_brands_override: parseOptionalBoolean(payload.exclude_brands_override),
    expand_alpha_override: parseOptionalBoolean(payload.expand_alpha_override),
    expand_numeric_override: parseOptionalBoolean(payload.expand_numeric_override),
    expand_patterns_override: parseOptionalBoolean(payload.expand_patterns_override),
    auto_classification_override: parseOptionalBoolean(payload.auto_classification_override),
    scoring_profile_override: parseOptionalText(payload.scoring_profile_override),
  };
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

function parseSubprojectName(raw: unknown): string {
  return String(raw ?? "Generale").trim() || "Generale";
}

function parseAutocompleteProvider(raw: unknown): AutocompleteProvider {
  return raw === "MOCK" ? "MOCK" : "GOOGLE_DIRECT";
}

function parseMetricsProvider(raw: unknown, current?: MetricsProvider): MetricsProvider {
  if (raw === "MOCK") {
    return "MOCK";
  }

  if (raw === "GOOGLE_KEYWORD_PLANNER") {
    // Resta solo su un progetto che lo ha già: in creazione o come nuovo valore è rifiutato.
    if (current !== "GOOGLE_KEYWORD_PLANNER") {
      throw new MetricsProviderUnavailableError();
    }
    return "GOOGLE_KEYWORD_PLANNER";
  }

  return "NONE";
}

function parseOptionalAutocompleteProvider(raw: unknown): AutocompleteProvider | null {
  if (raw == null || raw === "") {
    return null;
  }

  if (raw === "MOCK") {
    return "MOCK";
  }

  if (raw === "GOOGLE_DIRECT") {
    return "GOOGLE_DIRECT";
  }

  return null;
}

function parseOptionalMetricsProvider(raw: unknown): MetricsProvider | null {
  if (raw == null || raw === "") {
    return null;
  }

  if (raw === "NONE") {
    return "NONE";
  }

  if (raw === "MOCK") {
    return "MOCK";
  }

  if (raw === "GOOGLE_KEYWORD_PLANNER") {
    return "GOOGLE_KEYWORD_PLANNER";
  }

  return null;
}

function parseBoolean(value: unknown, defaultValue: boolean): boolean {
  const parsed = parseOptionalBoolean(value);
  if (parsed === null) {
    return defaultValue;
  }

  return parsed;
}

function parseOptionalBoolean(value: unknown): boolean | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === "inherit") {
      return null;
    }

    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return Boolean(value);
}

function parseNonNegativeInt(value: unknown, defaultValue: number): number {
  const parsed = parseOptionalNonNegativeInt(value);
  if (parsed === null) {
    return defaultValue;
  }

  return parsed;
}

function parseOptionalNonNegativeInt(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.trunc(parsed));
}

function parseOptionalText(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function parseOptionalLanguage(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return normalizeLanguageCode(value, "en");
}

function parseOptionalCountry(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return normalizeCountryCode(value, "US");
}
