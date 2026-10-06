"use client";

import { useRefreshAction } from "@/lib/client/use-refresh-action";

type DeleteEntityButtonProps = {
  /** Rotta che riceve la DELETE. */
  endpoint: string;
  /** Testo della conferma del browser. */
  confirmMessage: string;
  /** Messaggio quando la risposta non è ok e l'API non ne dà uno. */
  failureMessage: string;
  buttonLabel?: string;
  buttonClassName?: string;
  redirectTo?: string | null;
  showInlineError?: boolean;
};

/** Pulsante di eliminazione di progetti e sezioni (T-1102): conferma, DELETE, redirect facoltativo e refresh. */
export function DeleteEntityButton({
  endpoint,
  confirmMessage,
  failureMessage,
  buttonLabel = "Elimina",
  buttonClassName = "btn-danger",
  redirectTo = null,
  showInlineError = true,
}: DeleteEntityButtonProps) {
  const { loading, error, run } = useRefreshAction();

  const remove = async () => {
    if (!window.confirm(confirmMessage)) {
      return;
    }

    const message = await run(() => fetch(endpoint, { method: "DELETE" }), {
      failureMessage,
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
        {loading ? "Eliminazione..." : buttonLabel}
      </button>
      {showInlineError && error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
