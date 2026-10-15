import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { PageIntro } from "@/components/page-intro";
import { SectionNav } from "@/components/section-nav";
import { requirePageUser } from "@/lib/auth/page-guard";

/** Sezioni dell'area «Il tuo account», nell'ordine della navigazione. */
const ACCOUNT_SECTIONS = [
  { href: "/account", label: "profile" },
  { href: "/account/security", label: "security" },
  { href: "/account/preferences", label: "preferences" },
  { href: "/account/connections", label: "connections" },
  { href: "/account/data", label: "data" },
] as const;

/**
 * Area «Il tuo account» (T-2801, D-41): titolo e navigazione a sezioni comuni alle cinque pagine. Il cambio password
 * obbligato (/account/password, T-1704) sta fuori dal gruppo e non mostra la navigazione.
 */
export default async function AccountSectionsLayout({ children }: { children: ReactNode }) {
  await requirePageUser();
  const t = await getTranslations("account.sections");

  return (
    <div className="space-y-6">
      <PageIntro title={t("title")} intro={t("intro")} />
      <div className="section-layout">
        <SectionNav label={t("nav")} items={ACCOUNT_SECTIONS.map((section) => ({ href: section.href, label: t(section.label) }))} />
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
