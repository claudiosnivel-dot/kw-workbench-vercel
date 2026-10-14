"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { ClassificationSelect } from "@/components/classification-select";
import { FormFeedback } from "@/components/form-feedback";
import { messageOf, readApiResponse, sendJson } from "@/lib/client/http";
import { planHref } from "@/lib/modules/next-step";
import type { StrategyRuleLimits, StrategyRules } from "@/lib/modules/strategy/types";

const NUMERIC_RULES = ["minKeywordsPerSpoke", "minSpokeVolume", "maxSpokesPerHub", "questionSpokeVolume"] as const;

type StrategySettingsProps = {
  projectId: string;
  sections: { id: string; name: string }[];
  defaults: StrategyRules;
  limits: StrategyRuleLimits;
  /** Rigenera il piano senza toccare le pagine iniziate (T-2502); senza, costruisce il primo piano. */
  regenerate?: boolean;
  /** Pulsante Annulla accanto all'invio, quando le impostazioni stanno in un dialogo. */
  onCancel?: () => void;
};

type Advanced = {
  sectionId: string;
  reviewStatus: "approved_pending" | "approved";
  minVolume: string;
  searchIntent: string;
  keywordType: string;
  rules: Record<(typeof NUMERIC_RULES)[number], string> & { questionsAs: StrategyRules["questionsAs"] };
};

/** Corpo della generazione: automatica con il pannello chiuso, esperta con perimetro e regole del pannello aperto. */
function requestBody(name: string, advanced: Advanced | null, regenerate: boolean) {
  const flags = regenerate ? { regenerate: true } : {};
  if (!advanced) {
    return { mode: "AUTO", name: name || undefined, ...flags };
  }
  return {
    mode: "EXPERT",
    name: name || undefined,
    ...flags,
    settings: {
      sectionId: advanced.sectionId || null,
      reviewStatus: advanced.reviewStatus,
      minVolume: advanced.minVolume === "" ? null : Number(advanced.minVolume),
      searchIntent: advanced.searchIntent || null,
      keywordType: advanced.keywordType || null,
      rules: {
        ...Object.fromEntries(NUMERIC_RULES.map((rule) => [rule, Number(advanced.rules[rule])])),
        questionsAs: advanced.rules.questionsAs,
      },
    },
  };
}

/**
 * Costruzione del piano (T-1905, T-2502): un clic con le impostazioni predefinite (modalità automatica) o, aprendo le
 * opzioni avanzate, con nome, perimetro e regole scelti (modalità esperta). Con regenerate rigenera il piano (dialogo
 * «Rigenera il piano»). Dopo la generazione il browser va al piano del progetto.
 */
export function StrategySettings({ projectId, sections, defaults, limits, regenerate = false, onCancel }: StrategySettingsProps) {
  const t = useTranslations("strategy.ui");
  const tPlan = useTranslations("plan");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const panelId = useId();
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState<Advanced>({
    sectionId: "",
    reviewStatus: "approved_pending",
    minVolume: "",
    searchIntent: "",
    keywordType: "",
    rules: {
      ...(Object.fromEntries(NUMERIC_RULES.map((rule) => [rule, String(defaults[rule])])) as Advanced["rules"]),
      questionsAs: defaults.questionsAs,
    },
  });
  const update = (patch: Partial<Advanced>) => setAdvanced((current) => ({ ...current, ...patch }));
  const updateRule = (patch: Partial<Advanced["rules"]>) =>
    setAdvanced((current) => ({ ...current, rules: { ...current.rules, ...patch } }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await sendJson(
        "POST",
        `/api/projects/${projectId}/strategies`,
        requestBody(name.trim(), open ? advanced : null, regenerate)
      );
      await readApiResponse<{ data: { id: string } }>(response, tErrors);
      router.push(planHref(projectId));
      router.refresh();
    } catch (submitError) {
      setError(messageOf(submitError, tCommon("unexpectedError")));
      setPending(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <button
        type="button"
        className="btn-secondary"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {t("advanced")}
      </button>
      <p className="text-sm text-slate-600">{t("advancedHint")}</p>

      {open && (
        <div id={panelId} className="grid gap-3 rounded-2xl border border-[var(--surface-border)] p-4 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="label">{t("nameLabel")}</span>
            <input className="input" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="block">
            <span className="label">{t("scope")}</span>
            <select className="select" value={advanced.sectionId} onChange={(event) => update({ sectionId: event.target.value })}>
              <option value="">{t("scopeProject")}</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">{t("reviewStatus")}</span>
            <select
              className="select"
              value={advanced.reviewStatus}
              onChange={(event) => update({ reviewStatus: event.target.value as Advanced["reviewStatus"] })}
            >
              <option value="approved_pending">{t("reviewApprovedPending")}</option>
              <option value="approved">{t("reviewApproved")}</option>
            </select>
          </label>
          <label className="block">
            <span className="label">{t("minVolume")}</span>
            <input
              className="input"
              type="number"
              min={0}
              value={advanced.minVolume}
              onChange={(event) => update({ minVolume: event.target.value })}
            />
          </label>
          <ClassificationSelect
            kind="intent"
            label={t("intent")}
            anyLabel={t("intentAny")}
            value={advanced.searchIntent}
            onChange={(event) => update({ searchIntent: event.target.value })}
          />
          <ClassificationSelect
            kind="type"
            label={t("keywordType")}
            anyLabel={t("keywordTypeAny")}
            value={advanced.keywordType}
            onChange={(event) => update({ keywordType: event.target.value })}
          />

          <fieldset className="grid gap-3 md:col-span-2 md:grid-cols-2">
            <legend className="label">{t("rules")}</legend>
            {NUMERIC_RULES.map((rule) => (
              <label key={rule} className="block">
                <span className="label">{t(rule)}</span>
                <input
                  className="input"
                  type="number"
                  required
                  min={limits[rule].min}
                  max={limits[rule].max}
                  value={advanced.rules[rule]}
                  onChange={(event) => updateRule({ [rule]: event.target.value })}
                />
              </label>
            ))}
            <label className="block">
              <span className="label">{t("questionsAs")}</span>
              <select
                className="select"
                value={advanced.rules.questionsAs}
                onChange={(event) => updateRule({ questionsAs: event.target.value as StrategyRules["questionsAs"] })}
              >
                <option value="faq">{t("questionsAsFaq")}</option>
                <option value="spokes">{t("questionsAsSpokes")}</option>
              </select>
            </label>
          </fieldset>
        </div>
      )}

      <FormFeedback error={error} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            {tPlan("regenerateDialog.cancel")}
          </button>
        )}
        <button className="btn-primary" type="submit" disabled={pending}>
          {regenerate ? (pending ? t("regenerating") : t("regenerate")) : pending ? t("generating") : t("generate")}
        </button>
      </div>
    </form>
  );
}
