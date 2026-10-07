import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

/** «Zona pericolosa» delle impostazioni di progetto e sezione (T-1303): avviso e pulsante di eliminazione. */
export function DangerZoneCard({ warning, children }: { warning: ReactNode; children: ReactNode }) {
  const t = useTranslations("common");

  return (
    <section className="card">
      <h2 className="mb-3 text-lg font-semibold text-red-700">{t("dangerZone")}</h2>
      <p className="mb-4 text-sm text-slate-600">{warning}</p>
      {children}
    </section>
  );
}
