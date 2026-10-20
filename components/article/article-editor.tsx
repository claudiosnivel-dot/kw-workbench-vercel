"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { type ArticlePublication, ArticleExportBar } from "@/components/article/article-export-bar";
import { type ArticleMark, ArticleMarkdown } from "@/components/article/article-markdown";
import { articleApiUrl, useArticleRequests } from "@/components/article/article-request";
import { ArticleSeoReport } from "@/components/article/article-seo-report";
import { ArticleStartDialog } from "@/components/article/article-start-dialog";
import { type ArticleImageView, type ArticleView, articleImages, checkMatches } from "@/lib/articles/view";
import { planHref } from "@/lib/modules/next-step";
import type { StrategyPageKind } from "@/lib/modules/strategy/types";

/** Polling del lavoro attivo (T-4401) e attesa senza digitare prima del salvataggio automatico (T-4402). */
const POLL_INTERVAL_MS = 3_000;
const SAVE_DELAY_MS = 1_000;
const MAX_INSTRUCTION = 500;
/** Limiti di T-4102, come i contatori dell'intestazione. */
const META_LIMITS = { meta_title: 60, meta_description: 155, slug: 80 } as const;

/** Regole dei controlli (StyleRule di T-4301) con un nome nel catalogo; l'elenco non importa il modulo dei controlli (D-22). */
const MARK_RULES = [
  "phrase",
  "em_dash",
  "emoji",
  "rhetorical_questions",
  "repeated_openings",
  "placeholder",
  "law",
  "amount",
  "percentage",
  "year",
  "number",
] as const;

const isMarkRule = (rule: string): rule is (typeof MARK_RULES)[number] => (MARK_RULES as readonly string[]).includes(rule);

type MetaField = keyof typeof META_LIMITS;
type Section = ArticleView["sections"][number];
/** Stato dell'ultimo salvataggio di un campo: il blocco (id) o un campo delle meta. */
type SaveStatus = { key: string; state: "saving" | "saved" | "error"; message?: string } | null;

/** Pagina del piano dell'articolo: H1, tipo e numero di H2 per una nuova generazione, keyword principale per la SEO. */
export type ArticleEditorPage = { id: string; h1: string; kind: StrategyPageKind; contentType: string; h2Count: number; mainKeyword: string };

export type ArticleEditorProps = {
  projectId: string;
  strategyId: string;
  page: ArticleEditorPage;
  /** H1 delle pagine del piano: i link interni del testo e i link del controllo SEO. */
  pages: Record<string, string>;
  article: ArticleView;
  /** Permesso strategy.write: modifiche e riscritture. */
  canEdit: boolean;
  /** Articoli accesi con la chiave e strategy.write: nuova generazione e «Riscrivi questo blocco». */
  canStart: boolean;
  /** Stato e indirizzo della pagina pubblicata, con la version del piano e il sito del progetto (T-4502). */
  publication: ArticlePublication;
};

const metaValue = (article: ArticleView, field: MetaField) =>
  (field === "meta_title" ? article.metaTitle : field === "meta_description" ? article.metaDescription : article.slug) ?? "";

/**
 * Editor dell'articolo di una pagina del piano (T-4401, T-4402): intestazione con H1, stato e avanzamento del lavoro
 * (polling ogni 3 s finché è attivo), title, meta description e slug con i contatori; poi i blocchi in ordine con i
 * tratti AI in giallo e i dati da verificare in arancio, «Modifica» con il salvataggio automatico 1 s dopo l'ultima
 * modifica e «Riscrivi questo blocco», i segnaposto immagine dopo il loro blocco con «Copia prompt» e il riquadro
 * «Controllo SEO». I salvataggi partono uno alla volta con la version dell'ultima risposta (CWE-362); un 409
 * ARTICLE_VERSION_CONFLICT chiede di ricaricare la pagina. Con un lavoro attivo non si modifica. Sotto l'H1 «Copia»,
 * «Scarica» e «Segna come pubblicata» (T-4501, T-4502).
 */
export function ArticleEditor({ projectId, strategyId, page, pages, article: initial, canEdit, canStart, publication }: ArticleEditorProps) {
  const t = useTranslations("article.editor");
  const tMarks = useTranslations("article.marks");
  const tStatus = useTranslations("article.editor.status");
  const requests = useArticleRequests();
  const { send } = requests;
  const router = useRouter();
  const fieldId = useId();
  const [article, setArticle] = useState(initial);
  const [polls, setPolls] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<SaveStatus>(null);
  const [rewrite, setRewrite] = useState<{ sectionId: string; instruction: string; error: string | null; pending: boolean } | null>(null);
  const [copied, setCopied] = useState<{ index: number; ok: boolean } | null>(null);
  const [restart, setRestart] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const version = useRef(initial.version);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const url = articleApiUrl(projectId, strategyId, page.id);
  const active = article.run !== null;
  const editable = canEdit && !active && article.status !== "GENERATING";
  const pageIds = useMemo(() => new Set(Object.keys(pages)), [pages]);
  const images = articleImages(article.images);

  // Polling del lavoro attivo: una lettura 3 s dopo l'ultima, finché il lavoro non è più attivo.
  useEffect(() => {
    if (!active) return;
    let current = true;
    const timer = window.setTimeout(() => {
      void send<ArticleView>(url).then((result) => {
        if (!current) return;
        if (result.ok) {
          version.current = result.data.version;
          setArticle(result.data);
        }
        setPolls((count) => count + 1);
      });
    }, POLL_INTERVAL_MS);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [active, polls, send, url]);

  // I salvataggi in attesa non partono più quando l'editor si smonta.
  useEffect(() => {
    const scheduled = timers.current;
    return () => {
      for (const timer of Object.values(scheduled)) clearTimeout(timer);
    };
  }, []);

  /** Salva in coda alle richieste precedenti, con la version dell'ultima risposta. */
  const save = (key: string, patch: Record<string, unknown>) => {
    clearTimeout(timers.current[key]);
    delete timers.current[key];
    queue.current = queue.current.then(async () => {
      setStatus({ key, state: "saving" });
      const result = await send<ArticleView>(url, { method: "PATCH", body: { version: version.current, ...patch } });
      if (result.ok) {
        version.current = result.data.version;
        setArticle(result.data);
        setStatus({ key, state: "saved" });
      } else {
        setStatus({ key, state: "error", message: result.code === "ARTICLE_VERSION_CONFLICT" ? t("conflict") : result.message });
      }
    });
  };

  const schedule = (key: string, patch: Record<string, unknown>) => {
    clearTimeout(timers.current[key]);
    setStatus(null);
    timers.current[key] = setTimeout(() => save(key, patch), SAVE_DELAY_MS);
  };

  const changeBody = (section: Section, body: string) => {
    setDrafts((current) => ({ ...current, [section.id]: body }));
    schedule(section.id, { sections: [{ id: section.id, body }] });
  };

  const changeMeta = (field: MetaField, value: string) => {
    setDrafts((current) => ({ ...current, [field]: value }));
    schedule(field, { [field]: value });
  };

  // «Fine»: il salvataggio in attesa parte subito, poi il blocco torna in lettura.
  const finishEditing = (section: Section) => {
    if (timers.current[section.id] !== undefined) save(section.id, { sections: [{ id: section.id, body: drafts[section.id] ?? section.body }] });
    setEditing(null);
    setDrafts(({ [section.id]: _done, ...rest }) => rest);
  };

  const startRewrite = async () => {
    if (!rewrite) return;
    setRewrite({ ...rewrite, pending: true, error: null });
    const result = await send<{ runId: string }>(`${url}/sections/${rewrite.sectionId}/rewrite`, {
      method: "POST",
      body: { instruction: rewrite.instruction.trim() || null },
    });
    if (!result.ok) {
      setRewrite({ ...rewrite, pending: false, error: requests.limited(result, "editor.rewriteLimited") });
      return;
    }
    setRewrite(null);
    setArticle((current) => ({
      ...current,
      run: { id: result.data.runId, scope: "SECTION", sectionId: rewrite.sectionId, status: "pending", phase: "sections", progress: { done: 0, total: 1 } },
    }));
  };

  const copyPrompt = (index: number, image: ArticleImageView) => {
    const done = (ok: boolean) => setCopied({ index, ok });
    if (!navigator.clipboard) {
      done(false);
      return;
    }
    void navigator.clipboard.writeText(image.prompt).then(
      () => done(true),
      () => done(false)
    );
  };

  const marksOf = (section: Section): ArticleMark[] =>
    checkMatches(section.checks, section.body).map((match) => ({
      ...match,
      label: tMarks(match.kind, { rule: isMarkRule(match.rule) ? tMarks(`rules.${match.rule}`) : match.rule }),
    }));

  const statusLine = (key: string) =>
    status?.key !== key ? null : status.state === "error" ? (
      <p className="text-sm text-red-700" role="alert">
        {status.message}
      </p>
    ) : (
      <p className="text-sm text-slate-600" role="status">
        {status.state === "saving" ? t("saving") : t("saved")}
      </p>
    );

  const run = article.run;
  const writingSection = (section: Section) => run !== null && (run.scope === "ARTICLE" || run.sectionId === section.id);

  const imageBoxes = (position: number) =>
    images.map((image, index) =>
      image.position !== position ? null : (
        <div key={`${index}-${image.fileName}`} role="group" aria-label={t("image", { number: index + 1 })} className="article-image space-y-2">
          <p className="text-sm font-semibold">
            {t("image", { number: index + 1 })}
            {image.cover && <span className="status-chip ml-2">{t("cover")}</span>}
          </p>
          <dl className="grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-slate-600">{t("imagePurpose")}</dt>
            <dd>{image.purpose}</dd>
            <dt className="text-slate-600">{t("imageAlt")}</dt>
            <dd>{image.alt}</dd>
            <dt className="text-slate-600">{t("imageFile")}</dt>
            <dd className="break-all">{image.fileName}</dd>
            <dt className="text-slate-600">{t("imagePrompt")}</dt>
            <dd className="break-words">{image.prompt}</dd>
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary btn-compact" onClick={() => copyPrompt(index, image)}>
              {t("copyPrompt")}
            </button>
            {copied?.index === index && (
              <span className="text-sm text-slate-600" role="status">
                {copied.ok ? t("copied") : t("copyFailed")}
              </span>
            )}
          </div>
        </div>
      )
    );

  return (
    <div className="space-y-5">
      <header className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link className="text-sm font-medium underline" href={planHref(projectId, { page: page.id })}>
            {t("back")}
          </Link>
          {canStart && !active && (
            <button type="button" className="btn-secondary" onClick={() => setRestart(true)}>
              {t("writeAgain")}
            </button>
          )}
        </div>
        <h1 className="text-2xl font-semibold">{page.h1}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm" role="status">
          <span className="status-chip">{tStatus(article.status)}</span>
          {run?.scope === "ARTICLE" && run.progress.total > 0 && <span>{t("progress", run.progress)}</span>}
          {run?.scope === "SECTION" && <span>{t("rewriting")}</span>}
        </div>
        <ArticleExportBar
          projectId={projectId}
          strategyId={strategyId}
          pageId={page.id}
          article={article}
          publication={publication}
          canEdit={canEdit}
          busy={active || article.status === "GENERATING"}
        />
        {article.status === "FAILED" && (
          <p className="text-sm text-red-700" role="alert">
            {requests.jobError(article.errorCode)}
          </p>
        )}
        <section aria-labelledby={`${fieldId}-meta`} className="space-y-3">
          <h2 id={`${fieldId}-meta`} className="text-sm font-semibold">
            {t("meta")}
          </h2>
          {(Object.keys(META_LIMITS) as MetaField[]).map((field) => {
            const value = drafts[field] ?? metaValue(article, field);
            const label = field === "meta_title" ? t("metaTitle") : field === "meta_description" ? t("metaDescription") : t("slug");
            return (
              <div key={field} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="label mb-0" htmlFor={`${fieldId}-${field}`}>
                    {label}
                  </label>
                  <span className="text-xs text-slate-500">{t("counter", { count: Array.from(value).length, max: META_LIMITS[field] })}</span>
                </div>
                <input
                  id={`${fieldId}-${field}`}
                  className="input"
                  value={value}
                  maxLength={META_LIMITS[field]}
                  readOnly={!editable}
                  onChange={(event) => changeMeta(field, event.target.value)}
                />
                {statusLine(field)}
              </div>
            );
          })}
        </section>
      </header>

      {article.sections.map((section) => {
        const name = section.kind === "INTRO" ? t("intro") : (section.heading ?? "");
        const headingId = `${fieldId}-block-${section.id}`;
        return (
          <div key={section.id} className="space-y-3">
            <section
              aria-label={section.kind === "INTRO" ? name : undefined}
              aria-labelledby={section.kind === "INTRO" ? undefined : headingId}
              className="card space-y-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                {section.kind !== "INTRO" && (
                  <h2 id={headingId} className="text-xl font-semibold">
                    {name}
                  </h2>
                )}
                {section.edited && <span className="status-chip">{t("edited")}</span>}
                {run?.scope === "SECTION" && run.sectionId === section.id && <span className="status-chip">{t("rewriting")}</span>}
              </div>
              {editing === section.id ? (
                <div className="space-y-1">
                  <label className="label" htmlFor={`${headingId}-text`}>
                    {t("editLabel", { block: name })}
                  </label>
                  <textarea
                    id={`${headingId}-text`}
                    className="input min-h-48 font-mono text-sm"
                    value={drafts[section.id] ?? section.body}
                    onChange={(event) => changeBody(section, event.target.value)}
                  />
                  <p className="text-xs text-slate-500">{t("editHint")}</p>
                </div>
              ) : section.body ? (
                <ArticleMarkdown markdown={section.body} marks={marksOf(section)} projectId={projectId} pageIds={pageIds} />
              ) : (
                <p className="text-sm text-slate-600">{writingSection(section) ? t("writing") : t("emptyBlock")}</p>
              )}
              {statusLine(section.id)}
              {editable && (
                <div className="flex flex-wrap gap-2">
                  {editing === section.id ? (
                    <button type="button" className="btn-secondary btn-compact" onClick={() => finishEditing(section)}>
                      {t("done")}
                    </button>
                  ) : (
                    <button type="button" className="btn-secondary btn-compact" disabled={editing !== null} onClick={() => setEditing(section.id)}>
                      {t("edit")}
                    </button>
                  )}
                  {canStart && editing !== section.id && (
                    <button
                      type="button"
                      className="btn-secondary btn-compact"
                      onClick={() => setRewrite({ sectionId: section.id, instruction: "", error: null, pending: false })}
                    >
                      {t("rewrite")}
                    </button>
                  )}
                </div>
              )}
              {editable && rewrite?.sectionId === section.id && (
                <div className="space-y-2">
                  <label className="label" htmlFor={`${headingId}-rewrite`}>
                    {t("rewriteLabel")}
                  </label>
                  <textarea
                    id={`${headingId}-rewrite`}
                    className="input min-h-20"
                    maxLength={MAX_INSTRUCTION}
                    value={rewrite.instruction}
                    onChange={(event) => setRewrite({ ...rewrite, instruction: event.target.value })}
                  />
                  {rewrite.error && (
                    <p className="text-sm text-red-700" role="alert">
                      {rewrite.error}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-primary btn-compact" disabled={rewrite.pending} onClick={() => void startRewrite()}>
                      {t("rewriteSubmit")}
                    </button>
                    <button type="button" className="btn-secondary btn-compact" onClick={() => setRewrite(null)}>
                      {t("rewriteCancel")}
                    </button>
                  </div>
                </div>
              )}
            </section>
            {imageBoxes(section.position)}
          </div>
        );
      })}

      <ArticleSeoReport article={article} pages={pages} mainKeyword={page.mainKeyword} />

      {restart && (
        <ArticleStartDialog
          projectId={projectId}
          strategyId={strategyId}
          page={page}
          replace
          onStarted={() => {
            setRestart(false);
            router.refresh();
          }}
          onClose={() => setRestart(false)}
        />
      )}
    </div>
  );
}
