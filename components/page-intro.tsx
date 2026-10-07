import type { ReactNode } from "react";

/** Card d'apertura di una pagina (T-1303): titolo h1 e testo introduttivo, come in Personalizza, Admin e Nuovo progetto. */
export function PageIntro({ title, intro }: { title: ReactNode; intro: ReactNode }) {
  return (
    <section className="card">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{intro}</p>
    </section>
  );
}
