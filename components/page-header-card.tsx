import type { ReactNode } from "react";

type PageHeaderCardProps = {
  title: ReactNode;
  subtitle: ReactNode;
  action: ReactNode;
  children?: ReactNode;
};

/** Card d'intestazione delle pagine di sezione: titolo, riga del progetto, azione a destra e contenuto (T-1102). */
export function PageHeaderCard({ title, subtitle, action, children }: PageHeaderCardProps) {
  return (
    <section className="card space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
