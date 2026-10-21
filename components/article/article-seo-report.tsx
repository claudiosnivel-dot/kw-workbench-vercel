"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { type ArticleView, checkMatches, linkedPageIds, outlineBlocksOf, type ReportProblemView, seoReportOf } from "@/lib/articles/view";

const MAX_META_TITLE = 60;
const MAX_META_DESCRIPTION = 155;

type ArticleSeoReportProps = {
  article: ArticleView;
  /** H1 delle pagine del piano, per i link presenti e mancanti. */
  pages: Record<string, string>;
  mainKeyword: string;
};

const characters = (text: string | null) => Array.from(text ?? "").length;

/**
 * Riquadro «Controllo SEO» dell'editor (T-4402), chiuso finché l'utente non lo apre: densità della keyword principale,
 * lunghezze di title e meta description, dati da verificare ancora aperti e problemi dell'articolo, poi per ogni blocco
 * le keyword della scaletta usate e mancanti, i link interni presenti e quelli obbligatori mancanti con l'H1 della
 * pagina e il tetto di parole della scaletta superato (T-5202). Legge il rapporto salvato dai controlli (T-4302) e il testo dei blocchi; tutto è reso come testo (CWE-79). Il
 * contenuto si rende solo con il riquadro aperto.
 */
export function ArticleSeoReport({ article, pages, mainKeyword }: ArticleSeoReportProps) {
  const t = useTranslations("article.seo");
  const tEditor = useTranslations("article.editor");
  const [open, setOpen] = useState(false);
  const report = seoReportOf(article.seoReport);
  const outline = new Map(outlineBlocksOf(article.outline).map((block) => [block.position, block]));
  const toVerify = article.sections.reduce(
    (count, section) => count + checkMatches(section.checks, section.body).filter((match) => match.kind === "to_verify").length,
    0
  );
  const pageTitles = (ids: string[]) => ids.flatMap((id) => (pages[id] ? [pages[id]] : []));

  const problemText = (problem: ReportProblemView): string | null => {
    switch (problem.rule) {
      case "main_keyword_h1":
      case "main_keyword_opening":
      case "main_keyword_meta_title":
      case "main_keyword_meta_description":
        return t(`problems.${problem.rule}`);
      case "meta_title_length":
      case "meta_description_length":
        return t(`problems.${problem.rule}`, { length: problem.length ?? 0, max: problem.max ?? 0 });
      case "density":
      case "words_over":
        return t(`problems.${problem.rule}`, { count: problem.count ?? 0, max: problem.max ?? 0 });
      case "ai_patterns":
        return t("problems.ai_patterns", { count: problem.count ?? 0 });
      default:
        return null;
    }
  };
  const texts = (problems: ReportProblemView[]) => problems.map(problemText).filter((text): text is string => text !== null);

  return (
    <details className="card space-y-3" open={open}>
      <summary
        className="cursor-pointer text-lg font-semibold"
        onClick={(event) => {
          event.preventDefault();
          setOpen((value) => !value);
        }}
      >
        {t("title")}
      </summary>
      {!open ? null : report ? (
        <div className="space-y-4 text-sm">
          <ul className="space-y-1">
            <li>{t("density", { keyword: mainKeyword, density: report.density })}</li>
            <li>{t("metaTitle", { length: characters(article.metaTitle), max: MAX_META_TITLE })}</li>
            <li>{t("metaDescription", { length: characters(article.metaDescription), max: MAX_META_DESCRIPTION })}</li>
            <li>{t("toVerify", { count: toVerify })}</li>
          </ul>
          {texts(report.problems).length > 0 && (
            <div className="space-y-1">
              <h3 className="font-semibold">{t("articleProblems")}</h3>
              <ul className="list-disc space-y-0.5 pl-5">
                {texts(report.problems).map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </div>
          )}
          {article.sections.map((section) => {
            const problems = report.blocks.find((block) => block.position === section.position)?.problems ?? [];
            const missing = problems.flatMap((problem) => (problem.rule === "keyword_missing" && problem.keyword ? [problem.keyword] : []));
            const used = (outline.get(section.position)?.keywords ?? []).filter((keyword) => !missing.includes(keyword));
            const present = pageTitles(linkedPageIds(section.body));
            const absent = pageTitles(problems.flatMap((problem) => (problem.rule === "link_missing" && problem.pageId ? [problem.pageId] : [])));
            const lines = [
              used.length > 0 ? t("keywordsUsed", { list: used.join(", ") }) : null,
              missing.length > 0 ? t("keywordsMissing", { list: missing.join(", ") }) : null,
              present.length > 0 ? t("linksPresent", { list: present.join(", ") }) : null,
              absent.length > 0 ? t("linksMissing", { list: absent.join(", ") }) : null,
              ...texts(problems),
            ].filter((line): line is string => line !== null);
            const name = section.kind === "INTRO" ? tEditor("intro") : (section.heading ?? "");
            return (
              <section key={section.id} aria-label={name} className="space-y-1">
                <h3 className="font-semibold">{name}</h3>
                {lines.length > 0 ? (
                  <ul className="space-y-0.5">
                    {lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-slate-600">{t("noProblems")}</p>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-600">{t("empty")}</p>
      )}
    </details>
  );
}
