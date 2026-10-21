"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ArticlePublishDialog } from "@/components/article/article-publish-dialog";
import { articleApiUrl } from "@/components/article/article-request";
import { DialogActions } from "@/components/dialog-actions";
import { ModalDialog } from "@/components/modal-dialog";
import { useApiData } from "@/lib/client/use-api-data";
import { type ArticleView, checkMatches } from "@/lib/articles/view";
import type { StrategyPageStatus } from "@/lib/modules/strategy/types";

const DOWNLOAD_FORMATS = ["html", "md", "docx"] as const;

/**
 * Pubblicazione della pagina dell'articolo (T-4502): version del piano per la PATCH, stato, indirizzo e sito del
 * progetto; collegamento a WordPress e bozza già inviata (T-4602).
 */
export type ArticlePublication = {
  strategyVersion: number;
  status: StrategyPageStatus;
  publishedUrl: string | null;
  siteUrl: string | null;
  wordpress: WordPressDraft & { configured: boolean };
};

type WordPressDraft = { postId: number | null; postUrl: string | null };

type ArticleExportBarProps = {
  projectId: string;
  strategyId: string;
  pageId: string;
  article: ArticleView;
  publication: ArticlePublication;
  /** Permesso strategy.write: «Segna come pubblicata» e «Invia a WordPress». */
  canEdit: boolean;
  /** Lavoro attivo o articolo in scrittura: niente copia né download. */
  busy: boolean;
};

/** Segnaposto «[da verificare: …]» e «[fonte da aggiungere]» ancora aperti nei blocchi (regola placeholder di T-4301). */
function openPlaceholders(article: ArticleView): number {
  return article.sections.reduce(
    (count, section) => count + checkMatches(section.checks, section.body).filter((match) => match.rule === "placeholder").length,
    0
  );
}

/**
 * Uscita dell'articolo dall'app (T-4501, T-4502): «Copia» mette negli appunti l'HTML con i dati strutturati e il Markdown
 * come testo, «Scarica» il file .html, .md o .docx dell'export; con segnaposto da verificare ancora aperti una finestra
 * ne dice il numero e l'azione parte solo con «Continua lo stesso». «Segna come pubblicata» salva l'indirizzo della
 * pagina, mostrato poi come link con «Cambia l'indirizzo». Con il progetto collegato, «Invia a WordPress» (con la
 * stessa conferma) crea la bozza e mostra il link «Bozza su WordPress»; dopo il primo invio il pulsante la aggiorna.
 */
export function ArticleExportBar({ projectId, strategyId, pageId, article, publication, canEdit, busy }: ArticleExportBarProps) {
  const t = useTranslations("article.export");
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [copied, setCopied] = useState<boolean | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [page, setPage] = useState(publication);
  const wordpressSend = useApiData<WordPressDraft>();
  const draft = wordpressSend.data ?? publication.wordpress;
  const placeholders = openPlaceholders(article);
  const exportUrl = (format: string) => articleApiUrl(projectId, strategyId, pageId, `/export?format=${format}`);

  const guarded = (action: () => void) => () => {
    if (placeholders > 0) setPending(() => action);
    else action();
  };

  const copy = () => {
    setCopied(null);
    const file = (format: "html" | "md", type: string) =>
      fetch(exportUrl(format), { cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error(`export ${response.status}`);
        return new Blob([await response.text()], { type });
      });
    const clipboard = navigator.clipboard as Clipboard | undefined;
    // Le Promise nel ClipboardItem tengono valido il clic dell'utente mentre l'export arriva dal server.
    const written = !clipboard
      ? Promise.reject(new Error("clipboard"))
      : typeof ClipboardItem !== "undefined" && typeof clipboard.write === "function"
        ? clipboard.write([new ClipboardItem({ "text/html": file("html", "text/html"), "text/plain": file("md", "text/plain") })])
        : file("md", "text/plain").then(async (blob) => clipboard.writeText(await blob.text()));
    void written.then(
      () => setCopied(true),
      () => setCopied(false)
    );
  };

  const download = (format: string) => {
    const link = document.createElement("a");
    link.href = exportUrl(format);
    link.download = "";
    document.body.append(link);
    link.click();
    link.remove();
  };

  const sendToWordPress = () => void wordpressSend.load(() => fetch(articleApiUrl(projectId, strategyId, pageId, "/wordpress"), { method: "POST" }));

  const published = page.status === "PUBLISHED" && page.publishedUrl;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary btn-compact" disabled={busy} onClick={guarded(copy)}>
          {t("copy")}
        </button>
        {DOWNLOAD_FORMATS.map((format) => (
          <button key={format} type="button" className="btn-secondary btn-compact" disabled={busy} onClick={guarded(() => download(format))}>
            {t("download", { format: `.${format}` })}
          </button>
        ))}
        {canEdit && (
          <button type="button" className="btn-secondary btn-compact" onClick={() => setPublishing(true)}>
            {published ? t("changeUrl") : t("markPublished")}
          </button>
        )}
        {canEdit && publication.wordpress.configured && (
          <button type="button" className="btn-secondary btn-compact" disabled={busy || wordpressSend.loading} onClick={guarded(sendToWordPress)}>
            {wordpressSend.loading ? t("wordpress.sending") : draft.postId ? t("wordpress.update") : t("wordpress.send")}
          </button>
        )}
      </div>
      {copied !== null && (
        <p className="text-sm text-slate-600" role="status">
          {copied ? t("copied") : t("copyFailed")}
        </p>
      )}
      {wordpressSend.data && (
        <p className="text-sm text-slate-600" role="status">
          {t("wordpress.sent")}
        </p>
      )}
      {wordpressSend.error && (
        <p className="text-sm text-red-700" role="alert">
          {wordpressSend.error}
        </p>
      )}
      {draft.postUrl && (
        <p className="text-sm">
          <a className="break-all font-medium underline" href={draft.postUrl} target="_blank" rel="noopener noreferrer">
            {t("wordpress.draft")}
          </a>
        </p>
      )}
      {published && (
        <p className="text-sm">
          {t("publishedAt")}{" "}
          <a className="break-all font-medium underline" href={page.publishedUrl ?? undefined} target="_blank" rel="noopener noreferrer">
            {page.publishedUrl}
          </a>
        </p>
      )}

      {pending && (
        <ModalDialog title={t("confirm.title")} onClose={() => setPending(null)}>
          <p className="text-sm">{t("confirm.text", { count: placeholders })}</p>
          <DialogActions error={null} cancel={{ label: t("confirm.back"), onClick: () => setPending(null) }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setPending(null);
                pending();
              }}
            >
              {t("confirm.continue")}
            </button>
          </DialogActions>
        </ModalDialog>
      )}
      {publishing && (
        <ArticlePublishDialog
          pageApiUrl={`/api/projects/${projectId}/strategies/${strategyId}/pages/${pageId}`}
          version={page.strategyVersion}
          initialUrl={page.publishedUrl ?? (page.siteUrl && article.slug ? `${page.siteUrl}/${article.slug}/` : "")}
          onSaved={({ version, publishedUrl }) => {
            setPage((current) => ({ ...current, strategyVersion: version, status: "PUBLISHED", publishedUrl }));
            setPublishing(false);
          }}
          onClose={() => setPublishing(false)}
        />
      )}
    </div>
  );
}
