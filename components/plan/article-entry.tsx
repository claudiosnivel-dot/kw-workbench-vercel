"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArticleStartDialog } from "@/components/article/article-start-dialog";
import { usePlanRequests } from "@/components/plan/plan-requests";
import { articleHref } from "@/lib/modules/next-step";
import type { StrategyPageView } from "@/lib/modules/strategy/types";

/** Articolo della pagina nel pannello (T-4401): avvio disponibile (articoli accesi, chiave, strategy.write) e articolo esistente. */
export type PanelArticle = { available: boolean; exists: boolean };

/**
 * Voce dell'articolo nel pannello della pagina (T-4401): con un articolo «Apri l'articolo» verso l'editor; senza, se
 * disponibile, «Scrivi l'articolo con l'AI» con la finestra di avvio, che dopo l'avvio apre l'editor.
 */
export function ArticleEntry({ page, article }: { page: StrategyPageView; article: PanelArticle }) {
  const t = useTranslations("article.start");
  const { projectId, strategyId } = usePlanRequests();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const href = articleHref(projectId, page.id);

  if (article.exists) {
    return (
      <Link className="btn-secondary inline-block" href={href}>
        {t("openExisting")}
      </Link>
    );
  }
  if (!article.available) return null;
  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        {t("open")}
      </button>
      {open && (
        <ArticleStartDialog
          projectId={projectId}
          strategyId={strategyId}
          page={{ id: page.id, kind: page.kind, contentType: page.contentType, h2Count: page.h2.length }}
          onStarted={() => router.push(href)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
