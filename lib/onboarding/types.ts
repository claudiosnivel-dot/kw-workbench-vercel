import type { AutocompleteProvider, MetricsProvider } from "@/lib/generated/prisma/enums";

// Tipi condivisi con i componenti client: nessun import del client Prisma dell'app (contratto D-22).

export type OnboardingProjectSnapshot = {
  id: string;
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

export type OnboardingSubprojectSnapshot = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
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
