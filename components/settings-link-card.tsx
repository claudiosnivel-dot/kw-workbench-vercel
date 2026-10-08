import Link from "next/link";
import { CardIntro } from "@/components/card-intro";

/** Card di Personalizza che porta a una pagina dedicata: workspace (T-1504) e dati dell'account (T-1804). */
export function SettingsLinkCard({ title, intro, href, label }: { title: string; intro: string; href: string; label: string }) {
  return (
    <section className="card space-y-4">
      <CardIntro title={title} intro={intro} />
      <Link className="btn-secondary inline-flex w-full justify-center sm:w-auto" href={href}>
        {label}
      </Link>
    </section>
  );
}
