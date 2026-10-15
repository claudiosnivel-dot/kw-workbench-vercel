import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

/**
 * «Zona pericolosa» delle impostazioni di progetto e sezione (T-1303): avviso e pulsante di eliminazione. Il titolo
 * cambia dove la zona raccoglie altre azioni, come «Azioni irreversibili» del workspace (T-3101).
 */
export function DangerZoneCard({ title, warning, children }: { title?: string; warning: ReactNode; children: ReactNode }) {
  const t = useTranslations("common");

  return (
    <section className="card">
      <h2 className="mb-3 text-lg font-semibold text-red-700">{title ?? t("dangerZone")}</h2>
      <p className="mb-4 text-sm text-slate-600">{warning}</p>
      {children}
    </section>
  );
}
