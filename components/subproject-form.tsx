"use client";

import { useTranslations } from "next-intl";
import { LocaleCodeOptions } from "@/components/locale-code-options";
import { BOOLEAN_SETTINGS, ChoiceOptions, SettingField } from "@/components/project-advanced-fields";
import type { AutocompleteProvider, MetricsProvider } from "@/lib/generated/prisma/enums";

/** Impostazioni diverse dal progetto di un argomento, come salvate: null vale «Come il progetto» (D-21, T-809). */
export type TopicOverrides = {
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

type BooleanChoice = "" | "true" | "false";
type BooleanOverrideKey = `${(typeof BOOLEAN_SETTINGS)[number]["field"]}_override`;

/** Valori dei campi del dialogo: stringa vuota per «Come il progetto». */
export type TopicOverrideValues = {
  language_code_override: string;
  country_code_override: string;
  autocomplete_provider_override: string;
  metrics_provider_override: string;
  min_volume_override: string;
  scoring_profile_override: string;
} & Record<BooleanOverrideKey, BooleanChoice>;

const overrideKey = (field: (typeof BOOLEAN_SETTINGS)[number]["field"]): BooleanOverrideKey => `${field}_override`;

/** Campi del dialogo dai valori salvati. */
export function overrideValuesOf(overrides: TopicOverrides): TopicOverrideValues {
  const values = {
    language_code_override: overrides.language_code_override ?? "",
    country_code_override: overrides.country_code_override ?? "",
    autocomplete_provider_override: overrides.autocomplete_provider_override ?? "",
    metrics_provider_override: overrides.metrics_provider_override ?? "",
    min_volume_override: overrides.min_volume_override == null ? "" : String(overrides.min_volume_override),
    scoring_profile_override: overrides.scoring_profile_override ?? "",
  } as TopicOverrideValues;
  for (const { field } of BOOLEAN_SETTINGS) {
    const saved = overrides[overrideKey(field)];
    values[overrideKey(field)] = saved == null ? "" : saved ? "true" : "false";
  }
  return values;
}

/** Volume minimo inviato: un intero non negativo, null se vuoto o non numerico. */
function parseMinVolume(value: string): number | null {
  const parsed = Number(value.trim());
  return value.trim() && Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
}

/**
 * Corpo della PATCH dell'argomento (T-809): ogni campo «Come il progetto» vale null. La fonte dei suggerimenti si invia
 * solo per il root admin, così il salvataggio di un altro utente non tocca quella scelta (la rotta la riserva comunque).
 */
export function overridesPayload(values: TopicOverrideValues, canEditAutocompleteProvider: boolean): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    language_code_override: values.language_code_override || null,
    country_code_override: values.country_code_override || null,
    metrics_provider_override: values.metrics_provider_override || null,
    min_volume_override: parseMinVolume(values.min_volume_override),
    scoring_profile_override: values.scoring_profile_override || null,
  };
  if (canEditAutocompleteProvider) {
    payload.autocomplete_provider_override = values.autocomplete_provider_override || null;
  }
  for (const { field } of BOOLEAN_SETTINGS) {
    const choice = values[overrideKey(field)];
    payload[overrideKey(field)] = choice === "" ? null : choice === "true";
  }
  return payload;
}

type TopicOverrideFieldsProps = {
  values: TopicOverrideValues;
  update: <K extends keyof TopicOverrideValues>(key: K, value: TopicOverrideValues[K]) => void;
  canEditAutocompleteProvider: boolean;
  showLicensedProvider: boolean;
};

/**
 * Campi delle impostazioni diverse dal progetto (T-2602): lingua e paese delle ricerche e gli stessi parametri tecnici
 * delle Avanzate, ognuno con la scelta predefinita «Come il progetto».
 */
export function TopicOverrideFields({ values, update, canEditAutocompleteProvider, showLicensedProvider }: TopicOverrideFieldsProps) {
  const t = useTranslations("keywords.overrides");
  const tFields = useTranslations("projects.fields");
  const asProject = <option value="">{t("asProject")}</option>;
  const select = (key: keyof TopicOverrideValues, label: string, options: React.ReactNode) => (
    <SettingField key={key} id={`topic-${key}`} label={label}>
      <select id={`topic-${key}`} className="select" value={values[key]} onChange={(event) => update(key, event.target.value)}>
        {asProject}
        {options}
      </select>
    </SettingField>
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {select("language_code_override", tFields("language"), <LocaleCodeOptions kind="language" current={values.language_code_override} />)}
      {select("country_code_override", tFields("country"), <LocaleCodeOptions kind="country" current={values.country_code_override} />)}
      {canEditAutocompleteProvider &&
        select("autocomplete_provider_override", tFields("autocompleteProvider"), <ChoiceOptions kind="autocomplete" />)}
      {select(
        "metrics_provider_override",
        tFields("metricsProvider"),
        <ChoiceOptions kind="metrics" showLicensedProvider={showLicensedProvider} />
      )}
      <SettingField id="topic-min_volume_override" label={tFields("minVolume")}>
        <input
          id="topic-min_volume_override"
          className="input"
          type="number"
          min={0}
          value={values.min_volume_override}
          placeholder={t("asProject")}
          onChange={(event) => update("min_volume_override", event.target.value)}
        />
      </SettingField>
      {select("scoring_profile_override", tFields("scoringProfile"), <ChoiceOptions kind="scoring" />)}
      {BOOLEAN_SETTINGS.map(({ field, label }) =>
        select(
          overrideKey(field),
          tFields(label),
          <>
            <option value="true">{t("yes")}</option>
            <option value="false">{t("no")}</option>
          </>
        )
      )}
    </div>
  );
}
