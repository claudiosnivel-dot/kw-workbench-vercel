"use client";

import { useTranslations } from "next-intl";
import { CardIntro } from "@/components/card-intro";
import { SettingField } from "@/components/project-advanced-fields";
import type { ArticleTone } from "@/lib/generated/prisma/enums";

/** Valori della scheda «Per gli articoli» nel form delle impostazioni (T-4001): '' è un campo vuoto, salvato null. */
export type ArticleBriefValues = {
  article_about: string;
  article_audience: string;
  article_tone: ArticleTone;
  business_name: string;
  business_address: string;
  site_url: string;
};

type TextField = {
  field: Exclude<keyof ArticleBriefValues, "article_tone">;
  label: "about" | "audience" | "businessName" | "businessAddress" | "siteUrl";
  max: number;
  rows?: number;
  hint?: "businessHint" | "siteUrlHint";
};

// Limiti delle colonne della migrazione 0049, riverificati dalla PATCH del progetto (T-4001).
const TEXTS: TextField[] = [
  { field: "article_about", label: "about", max: 1000, rows: 4 },
  { field: "article_audience", label: "audience", max: 300, rows: 2 },
];
const BUSINESS: TextField[] = [
  { field: "business_name", label: "businessName", max: 120, hint: "businessHint" },
  { field: "business_address", label: "businessAddress", max: 300 },
  { field: "site_url", label: "siteUrl", max: 300, hint: "siteUrlHint" },
];
const TONES: ArticleTone[] = ["professional", "friendly", "technical"];

type ArticleBriefCardProps = {
  values: ArticleBriefValues;
  update: <K extends keyof ArticleBriefValues>(key: K, value: ArticleBriefValues[K]) => void;
  /** Permesso project.update: senza, i campi sono in sola lettura. */
  canEdit: boolean;
};

/**
 * Blocco «Per gli articoli» delle impostazioni del progetto (T-4001, D-46): chi siete e cosa offrite, a chi vi
 * rivolgete, tono, nome e indirizzo dell'attività facoltativi e indirizzo del sito per i link interni, i testi con il
 * contatore dei caratteri, e la riga che dice che vanno a OpenRouter. Si salva con il Salva del progetto; i testi
 * restano testo, resi da React (CWE-79).
 */
export function ArticleBriefCard({ values, update, canEdit }: ArticleBriefCardProps) {
  const t = useTranslations("projects.articleBrief");

  const text = ({ field, label, max, rows, hint }: TextField) => {
    const id = `article-brief-${field}`;
    const common = {
      id,
      className: "input",
      value: values[field],
      maxLength: max,
      readOnly: !canEdit,
      "aria-describedby": `${id}-count`,
    };
    return (
      <div key={field} className={rows ? "md:col-span-2" : undefined}>
        <SettingField id={id} label={t(label)} hint={hint && t(hint)}>
          {rows ? (
            <textarea {...common} rows={rows} onChange={(event) => update(field, event.target.value)} />
          ) : (
            <input {...common} type={field === "site_url" ? "url" : "text"} onChange={(event) => update(field, event.target.value)} />
          )}
        </SettingField>
        <p id={`${id}-count`} className="mt-1 text-xs tabular-nums text-slate-500">
          {t("counter", { count: values[field].length, max })}
        </p>
      </div>
    );
  };

  return (
    <section className="card space-y-4">
      <CardIntro title={t("title")} intro={t("intro")} />
      <div className="grid gap-4 md:grid-cols-2">
        {TEXTS.map(text)}
        <SettingField id="article-brief-tone" label={t("tone")}>
          <select
            id="article-brief-tone"
            className="select"
            value={values.article_tone}
            disabled={!canEdit}
            onChange={(event) => update("article_tone", event.target.value as ArticleTone)}
          >
            {TONES.map((tone) => (
              <option key={tone} value={tone}>
                {t(`tones.${tone}`)}
              </option>
            ))}
          </select>
        </SettingField>
        {BUSINESS.map(text)}
      </div>
      <p className="text-sm text-slate-600">{t("openRouter")}</p>
      {!canEdit && <p className="text-sm text-slate-600">{t("readOnly")}</p>}
    </section>
  );
}
