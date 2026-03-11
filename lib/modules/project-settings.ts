import { AutocompleteProvider, MetricsProvider } from "@prisma/client";
import { normalizeCountryCode, normalizeLanguageCode } from "@/lib/constants/locale-options";
import { splitLines } from "@/lib/utils";

export type ProjectSettingsInput = {
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
  seeds: string[];
};

export function parseProjectPayload(payload: Record<string, unknown>): ProjectSettingsInput {
  const seedInput = String(payload.seeds ?? "");
  const seeds = Array.from(new Set(splitLines(seedInput))).slice(0, 500);

  const toBoolean = (value: unknown, defaultValue: boolean): boolean => {
    if (value === undefined || value === null) {
      return defaultValue;
    }
    return Boolean(value);
  };

  return {
    name: String(payload.name ?? "Progetto senza nome").trim() || "Progetto senza nome",
    language_code: normalizeLanguageCode(payload.language_code, "en"),
    country_code: normalizeCountryCode(payload.country_code, "US"),
    autocomplete_provider: parseAutocompleteProvider(payload.autocomplete_provider),
    metrics_provider: parseMetricsProvider(payload.metrics_provider),
    min_volume: Number(payload.min_volume ?? 0) || 0,
    exclude_brands: toBoolean(payload.exclude_brands, true),
    expand_alpha: toBoolean(payload.expand_alpha, true),
    expand_numeric: toBoolean(payload.expand_numeric, true),
    expand_patterns: toBoolean(payload.expand_patterns, true),
    auto_classification: toBoolean(payload.auto_classification, true),
    scoring_profile: String(payload.scoring_profile ?? "balanced").trim() || "balanced",
    seeds,
  };
}

function parseAutocompleteProvider(raw: unknown): AutocompleteProvider {
  return raw === "GOOGLE_DIRECT" ? "GOOGLE_DIRECT" : "MOCK";
}

function parseMetricsProvider(raw: unknown): MetricsProvider {
  if (raw === "MOCK") {
    return "MOCK";
  }

  if (raw === "GOOGLE_KEYWORD_PLANNER") {
    return "GOOGLE_KEYWORD_PLANNER";
  }

  return "NONE";
}