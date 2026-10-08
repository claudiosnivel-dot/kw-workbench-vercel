"use client";

import { FormFeedback } from "@/components/form-feedback";
import { useRefreshAction } from "@/lib/client/use-refresh-action";

/** Azione che chiede conferma, chiama l'API e ricarica la pagina; l'errore resta accanto al pulsante. */
export function ConfirmedActionButton({
  confirmText,
  label,
  pendingLabel,
  request,
  className = "btn-secondary",
  redirectTo,
  testId,
}: {
  confirmText: string;
  label: string;
  pendingLabel: string;
  request: () => Promise<Response>;
  className?: string;
  redirectTo?: string;
  testId?: string;
}) {
  const { loading, error, run } = useRefreshAction();

  const onClick = () => {
    if (window.confirm(confirmText)) {
      void run(request, { redirectTo, keepLoadingOnSuccess: true });
    }
  };

  return (
    <div className="space-y-1">
      <button type="button" className={className} disabled={loading} onClick={onClick} data-testid={testId}>
        {loading ? pendingLabel : label}
      </button>
      <FormFeedback error={error} />
    </div>
  );
}
