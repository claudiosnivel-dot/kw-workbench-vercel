"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type ReactNode, useId } from "react";
import { FormFeedback } from "@/components/form-feedback";
import { LocaleCodeOptions } from "@/components/locale-code-options";
import { AdvancedProjectFields, type ProjectSettingsValues, SettingField } from "@/components/project-advanced-fields";
import { readApiResponse, sendJson } from "@/lib/client/http";
import { useFormValues } from "@/lib/client/use-form-values";
import { useSaveAction } from "@/lib/client/use-save-action";

type ProjectSettingsFormProps = {
  projectId: string;
  initialValues: ProjectSettingsValues;
  canEditAutocompleteProvider: boolean;
  /** Blocco dei marchi dei concorrenti (T-2601), tra «Il progetto» e le Avanzate: si salva da solo. */
  brands: ReactNode;
};

/**
 * Impostazioni del progetto (T-2602): blocco «Il progetto» (nome, lingua e paese delle ricerche), poi i marchi, poi le
 * Avanzate chiuse con i parametri tecnici, e un solo Salva che invia la PATCH del progetto (T-809). Lingua e paese
 * sono il codice salvato, in minuscolo e maiuscolo come li vuole la rotta.
 */
export function ProjectSettingsForm({ projectId, initialValues, canEditAutocompleteProvider, brands }: ProjectSettingsFormProps) {
  const t = useTranslations("projects.settings");
  const tFields = useTranslations("projects.fields");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const formId = useId();
  // DataForSEO ha un costo per richiesta: lo sceglie solo il root admin, chi lo ha già lo vede selezionato (T-902).
  const showLicensedProvider = canEditAutocompleteProvider || initialValues.metrics_provider === "DATAFORSEO";
  const { values, update } = useFormValues<ProjectSettingsValues>(initialValues);
  const { saving, error, success, save } = useSaveAction();

  const languageValue = values.language_code.trim().toLowerCase() || "en";
  const countryValue = values.country_code.trim().toUpperCase() || "US";

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = {
      ...values,
      language_code: languageValue,
      country_code: countryValue,
      autocomplete_provider: canEditAutocompleteProvider ? values.autocomplete_provider : "GOOGLE_DIRECT",
    };

    void save(async (tErrors) => {
      await readApiResponse(await sendJson("PATCH", `/api/projects/${projectId}`, body), tErrors);
      router.refresh();
      return t("saved");
    });
  };

  return (
    <>
      <form id={formId} onSubmit={submit} className="card space-y-4">
        <h2 className="text-lg font-semibold">{t("projectBlock")}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <SettingField id="name" label={t("name")}>
            <input id="name" className="input" value={values.name} onChange={(event) => update("name", event.target.value)} required />
          </SettingField>
          <SettingField id="language_code" label={tFields("language")}>
            <select id="language_code" className="select" value={languageValue} onChange={(event) => update("language_code", event.target.value)}>
              <LocaleCodeOptions kind="language" current={languageValue} />
            </select>
          </SettingField>
          <SettingField id="country_code" label={tFields("country")}>
            <select id="country_code" className="select" value={countryValue} onChange={(event) => update("country_code", event.target.value)}>
              <LocaleCodeOptions kind="country" current={countryValue} />
            </select>
          </SettingField>
        </div>
      </form>

      {brands}

      <details className="card">
        <summary className="cursor-pointer text-lg font-semibold">{t("advancedTitle")}</summary>
        <div className="mt-4 space-y-4">
          <p className="text-sm text-slate-600">{t("advancedIntro")}</p>
          <AdvancedProjectFields
            values={values}
            update={update}
            canEditAutocompleteProvider={canEditAutocompleteProvider}
            showLicensedProvider={showLicensedProvider}
          />
        </div>
      </details>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {/* Il pulsante primario della schermata è quello della barra del prossimo passo (D-39, T-2605). */}
        <button className="btn-secondary w-full sm:w-auto" disabled={saving} type="submit" form={formId}>
          {saving ? tCommon("saving") : t("save")}
        </button>
        <FormFeedback error={error} success={success} />
      </div>
    </>
  );
}
