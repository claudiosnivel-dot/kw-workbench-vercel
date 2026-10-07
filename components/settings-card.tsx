import type { ReactNode } from "react";
import { CardIntro } from "@/components/card-intro";
import { FormFeedback } from "@/components/form-feedback";

type SettingsCardProps = {
  title: ReactNode;
  intro?: ReactNode;
  /** Spaziatura e classi aggiuntive della card. */
  className?: string;
  id?: string;
  error?: string | null;
  success?: string | null;
  /** Pulsante di salvataggio in fondo alla card, prima dell'esito. */
  save?: { onClick: () => void; pending: boolean; label: string; pendingLabel: string };
  children: ReactNode;
};

/** Card di Personalizza e dell'admin (T-1303): titolo, contenuto, pulsante di salvataggio facoltativo ed esito. */
export function SettingsCard({ title, intro, className = "space-y-4", id, error, success, save, children }: SettingsCardProps) {
  return (
    <section id={id} className={`card ${className}`}>
      <CardIntro title={title} intro={intro} />
      {children}
      {save && (
        <button className="btn-primary w-full sm:w-auto" type="button" onClick={save.onClick} disabled={save.pending}>
          {save.pending ? save.pendingLabel : save.label}
        </button>
      )}
      <FormFeedback error={error} success={success} />
    </section>
  );
}
