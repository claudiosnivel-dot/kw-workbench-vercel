"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { FormFeedback } from "@/components/form-feedback";
import { messageOf, readApiResponse, sendJson } from "@/lib/client/http";
import type { StrategyRuleLimits, StrategyRules } from "@/lib/modules/strategy/types";

const INTENTS = ["informational", "commercial", "transactional", "navigational", "mixed"] as const;
const KEYWORD_TYPES = ["generic", "question", "comparison", "branded", "local", "tool", "service", "product", "content_topic"] as const;
const NUMERIC_RULES = ["minKeywordsPerSpoke", "minSpokeVolume", "maxSpokesPerHub", "questionSpokeVolume"] as const;

type StrategySettingsProps = {
  projectId: string;
  sections: { id: string; name: string }[];
  defaults: StrategyRules;
  limits: StrategyRuleLimits;
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
function requestBody(name: string, advanced: Advanced | null) {
  if (!advanced) {
    return { mode: "AUTO", name: name || undefined };
  }
  return {
    mode: "EXPERT",
    name: name || undefined,
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
 * Generazione di una strategia (T-1905): un clic con le impostazioni predefinite (modalità automatica) o, aprendo il
 * pannello delle impostazioni avanzate, con perimetro e regole scelti (modalità esperta). Dopo la generazione il
 * browser va alla pagina della strategia.
 */
export function StrategySettings({ projectId, sections, defaults, limits }: StrategySettingsProps) {
  const t = useTranslations("strategy.ui");
  const tResults = useTranslations("results");
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
      const response = await sendJson("POST", `/api/projects/${projectId}/strategies`, requestBody(name.trim(), open ? advanced : null));
      const payload = await readApiResponse<{ data: { id: string } }>(response, tErrors);
      router.push(`/projects/${projectId}/strategy/${payload!.data.id}`);
    } catch (submitError) {
      setError(messageOf(submitError, tCommon("unexpectedError")));
      setPending(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label className="block">
          <span className="label">{t("nameLabel")}</span>
          <input className="input" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
        </label>
        <button className="btn-primary" type="submit" disabled={pending}>
          {pending ? t("generating") : t("generate")}
        </button>
      </div>

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
          <label className="block">
            <span className="label">{t("intent")}</span>
            <select className="select" value={advanced.searchIntent} onChange={(event) => update({ searchIntent: event.target.value })}>
              <option value="">{t("intentAny")}</option>
              {INTENTS.map((intent) => (
                <option key={intent} value={intent}>
                  {tResults(`intent.${intent}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">{t("keywordType")}</span>
            <select className="select" value={advanced.keywordType} onChange={(event) => update({ keywordType: event.target.value })}>
              <option value="">{t("keywordTypeAny")}</option>
              {KEYWORD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {tResults(`type.${type}`)}
                </option>
              ))}
            </select>
          </label>

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
    </form>
  );
}
