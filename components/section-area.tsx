import type { ReactNode } from "react";
import { PageIntro } from "@/components/page-intro";
import { SectionNav, type SectionNavItem } from "@/components/section-nav";

type SectionAreaProps = {
  title: ReactNode;
  intro: ReactNode;
  /** Nome accessibile della navigazione, già tradotto. */
  navLabel: string;
  items: SectionNavItem[];
  children: ReactNode;
};

/**
 * Area del menu dell'utente con le sue sezioni (T-2801, T-3101, T-3301): intestazione, navigazione a sinistra (sopra
 * sotto i 768 px) e contenuto della sezione aperta. La usano «Il tuo account», «Workspace» e «Amministrazione».
 */
export function SectionArea({ title, intro, navLabel, items, children }: SectionAreaProps) {
  return (
    <div className="space-y-6">
      <PageIntro title={title} intro={intro} />
      <div className="section-layout">
        <SectionNav label={navLabel} items={items} />
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
