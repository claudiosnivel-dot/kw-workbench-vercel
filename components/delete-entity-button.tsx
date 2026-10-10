"use client";

import { useTranslations } from "next-intl";
import { useRefreshAction } from "@/lib/client/use-refresh-action";

type DeleteEntityButtonProps = {
  /** Rotta che riceve la DELETE. */
  endpoint: string;
  /** Progetto, sezione o strategia (T-1905): sceglie il testo della conferma nel catalogo. */
  kind: "project" | "section" | "strategy";
  /** Nome mostrato nella conferma del browser, interpolato come testo. */
  name: string;
  buttonLabel?: string;
  buttonClassName?: string;
  redirectTo?: string | null;
  showInlineError?: boolean;
};

/** Pulsante di eliminazione di progetti e sezioni (T-1102): conferma, DELETE, redirect facoltativo e refresh. */
export function DeleteEntityButton({
  endpoint,
  kind,
  name,
  buttonLabel,
  buttonClassName = "btn-danger",
  redirectTo = null,
  showInlineError = true,
}: DeleteEntityButtonProps) {
  const t = useTranslations();
  const { loading, error, run } = useRefreshAction();
  const namespace = ({ project: "projects", section: "sections", strategy: "strategy" } as const)[kind];

  const remove = async () => {
    if (!window.confirm(t(`${namespace}.delete.confirm`, { name }))) {
      return;
    }

    const message = await run(() => fetch(endpoint, { method: "DELETE" }), {
      redirectTo,
      keepLoadingOnSuccess: true,
    });
    if (message && !showInlineError) {
      window.alert(message);
    }
  };

  return (
    <div className={showInlineError ? "space-y-2" : ""}>
      <button type="button" className={buttonClassName} disabled={loading} onClick={remove}>
        {loading ? t("common.deleting") : (buttonLabel ?? t("common.delete"))}
      </button>
      {showInlineError && error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
