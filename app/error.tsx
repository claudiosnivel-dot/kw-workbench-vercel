"use client";

import { useTranslations } from "next-intl";
import { NarrowCard } from "@/components/narrow-card";

// Mostra solo il digest dell'errore, mai message o stack (CWE-209): il digest ritrova l'errore nei log del server.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("errorPages.error");
  return (
    <NarrowCard title={t("title")}>
      <p className="text-sm text-slate-600">{t("body")}</p>
      {error.digest && <p className="text-xs text-slate-500">{t("code", { digest: error.digest })}</p>}
      <button className="btn-primary" type="button" onClick={() => retry()}>
        {t("retry")}
      </button>
    </NarrowCard>
  );
}
