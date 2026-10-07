"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormFeedback } from "@/components/form-feedback";
import { AdvancedProjectFields, type ProjectFormValues } from "@/components/project-advanced-fields";
import { ApiErrorPayload, buildApiErrorMessage, type ErrorTranslator, readApiResponse, readJsonSafe, sendJson } from "@/lib/client/http";
import { useFormValues } from "@/lib/client/use-form-values";
import { useSaveAction } from "@/lib/client/use-save-action";

type ProjectCreateResponse = ApiErrorPayload & {
  data?: {
    project?: { id: string };
    id?: string;
    initial_subproject_id?: string;
  };
};

type ProjectFormProps = {
  mode: "create" | "edit";
  projectId?: string;
  initialValues?: ProjectFormValues;
  canEditAutocompleteProvider?: boolean;
  showSeeds?: boolean;
  showInitialSubprojectName?: boolean;
};

// Il nome della prima sezione arriva dal catalogo della lingua corrente (T-1302).
const defaultValues: Omit<ProjectFormValues, "initial_subproject_name"> = {
  name: "",
  language_code: "en",
  country_code: "US",
  seeds: "",
  autocomplete_provider: "GOOGLE_DIRECT",
  metrics_provider: "NONE",
  min_volume: 0,
  exclude_brands: true,
  expand_alpha: true,
  expand_numeric: true,
  expand_patterns: true,
  auto_classification: true,
  scoring_profile: "balanced",
};

export function ProjectForm({
  mode,
  projectId,
  initialValues,
  canEditAutocompleteProvider = false,
  showSeeds = true,
  showInitialSubprojectName = true,
}: ProjectFormProps) {
  const t = useTranslations("projects.form");
  const tCommon = useTranslations("common");
  const router = useRouter();
  // DataForSEO ha un costo per richiesta: lo sceglie solo il root admin (lo stesso che sceglie l'autocomplete),
  // chi lo ha già lo vede selezionato (T-902).
  const showLicensedProvider = canEditAutocompleteProvider || initialValues?.metrics_provider === "DATAFORSEO";
  const { values, update: setField } = useFormValues<ProjectFormValues>(() => {
    const base = initialValues ?? { ...defaultValues, initial_subproject_name: t("defaultSectionName") };
    if (canEditAutocompleteProvider) {
      return base;
    }

    return {
      ...base,
      autocomplete_provider: "GOOGLE_DIRECT",
    };
  });

  const { saving, error, success: message, setError, save } = useSaveAction();
  const [submitIntent, setSubmitIntent] = useState<"save" | "save-and-run">("save");
  const [stepTwoCompleted, setStepTwoCompleted] = useState(mode !== "create");

  const languageValue = values.language_code.trim().toLowerCase() || "en";
  const countryValue = values.country_code.trim().toUpperCase() || "US";
  const seedCount = values.seeds
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean).length;

  const update = <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) => {
    if (mode === "create" && (key === "language_code" || key === "country_code")) {
      setStepTwoCompleted(false);
    }

    setField(key, value);
  };

  // Prima estrazione subito dopo la creazione: un errore non blocca l'apertura del progetto creato.
  const startFirstRun = async (createdProjectId: string, subprojectId: string, tErrors: ErrorTranslator) => {
    try {
      const runResponse = await sendJson("POST", `/api/projects/${createdProjectId}/run`, { subprojectId });
      if (!runResponse.ok) {
        window.alert(buildApiErrorMessage(runResponse, await readJsonSafe<ApiErrorPayload>(runResponse), tErrors));
      }
    } catch {
      window.alert(t("runFailedAfterCreate"));
    }
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (mode === "create" && !stepTwoCompleted) {
      setError(t("step2Required"));
      return;
    }

    const endpoint = mode === "create" ? "/api/projects" : `/api/projects/${projectId}`;
    const method = mode === "create" ? "POST" : "PATCH";

    const body: Record<string, unknown> = {
      name: values.name,
      language_code: languageValue,
      country_code: countryValue,
      autocomplete_provider: canEditAutocompleteProvider ? values.autocomplete_provider : "GOOGLE_DIRECT",
      metrics_provider: values.metrics_provider,
      min_volume: values.min_volume,
      exclude_brands: values.exclude_brands,
      expand_alpha: values.expand_alpha,
      expand_numeric: values.expand_numeric,
      expand_patterns: values.expand_patterns,
      auto_classification: values.auto_classification,
      scoring_profile: values.scoring_profile,
    };

    if (mode === "create") {
      body.initial_subproject_name = values.initial_subproject_name;
      body.seeds = showSeeds ? values.seeds : "";
    }

    void save(async (tErrors) => {
      const payload = await readApiResponse<ProjectCreateResponse>(await sendJson(method, endpoint, body), tErrors);
      const createdProjectId = mode === "create" ? (payload?.data?.project?.id ?? payload?.data?.id) : undefined;
      if (createdProjectId) {
        const initialSubprojectId = payload?.data?.initial_subproject_id;
        if (submitIntent === "save-and-run" && initialSubprojectId && seedCount > 0) {
          await startFirstRun(createdProjectId, initialSubprojectId, tErrors);
        }
        router.push(`/projects/${createdProjectId}`);
        router.refresh();
        return "";
      }

      router.refresh();
      return t("saved");
    });
  };

  const showCreateFlow = mode === "create";
  const canSubmitCreate = mode !== "create" || stepTwoCompleted;
  const advancedFields = (
    <AdvancedProjectFields
      values={values}
      update={update}
      languageValue={languageValue}
      countryValue={countryValue}
      canEditAutocompleteProvider={canEditAutocompleteProvider}
      showLicensedProvider={showLicensedProvider}
    />
  );

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="space-y-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
        <h2 className="text-base font-semibold">{showCreateFlow ? t("step1") : t("mainSettings")}</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="name">
              {t("name")}
            </label>
            <input
              id="name"
              className="input"
              value={values.name}
              onChange={(event) => update("name", event.target.value)}
              required
            />
            <p className="mt-1 text-xs text-slate-500">{t("nameHint")}</p>
          </div>

          {showInitialSubprojectName && mode === "create" && (
            <div>
              <label className="label" htmlFor="initial_subproject_name">
                {t("firstSection")}
              </label>
              <input
                id="initial_subproject_name"
                className="input"
                value={values.initial_subproject_name}
                onChange={(event) => update("initial_subproject_name", event.target.value)}
                required
              />
              <p className="mt-1 text-xs text-slate-500">{t("firstSectionHint")}</p>
            </div>
          )}
        </div>

        {showSeeds && mode === "create" && (
          <div>
            <label className="label" htmlFor="seeds">
              {t("seeds")}
            </label>
            <textarea
              id="seeds"
              className="input min-h-40"
              value={values.seeds}
              onChange={(event) => update("seeds", event.target.value)}
              placeholder={t("seedsPlaceholder")}
            />
            <p className="mt-1 text-xs text-slate-500">{t("seedsHint", { count: seedCount })}</p>
          </div>
        )}
      </section>

      {showCreateFlow ? (
        <section className="space-y-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
          <h2 className="text-base font-semibold">{t("step2Title")}</h2>
          <p className="text-xs text-slate-500">{t("step2Hint")}</p>

          {advancedFields}

          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-background)] p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={stepTwoCompleted}
                onChange={(event) => setStepTwoCompleted(event.target.checked)}
              />
              {t("step2Confirm")}
            </label>
          </div>
        </section>
      ) : (
        <section className="space-y-4 rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
          <h2 className="text-base font-semibold">{t("advancedTitle")}</h2>
          {advancedFields}
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <button
          className="btn-primary w-full sm:w-auto"
          disabled={saving || !canSubmitCreate}
          type="submit"
          onClick={() => setSubmitIntent("save")}
        >
          {saving ? tCommon("saving") : mode === "create" ? t("createAndOpen") : t("saveSettings")}
        </button>

        {mode === "create" && (
          <button
            className="btn-secondary w-full sm:w-auto"
            disabled={saving || seedCount === 0 || !canSubmitCreate}
            type="submit"
            onClick={() => setSubmitIntent("save-and-run")}
            title={!canSubmitCreate ? t("step2RequiredTitle") : seedCount === 0 ? t("seedRequiredTitle") : ""}
          >
            {saving && submitIntent === "save-and-run" ? t("starting") : t("createAndRun")}
          </button>
        )}

        <FormFeedback error={error} success={message} />
      </div>
    </form>
  );
}
