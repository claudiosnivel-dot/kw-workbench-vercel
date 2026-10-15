import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { SectionArea } from "@/components/section-area";
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
    <SectionArea
      title={t("title")}
      intro={t("intro")}
      navLabel={t("nav")}
      items={ACCOUNT_SECTIONS.map((section) => ({ href: section.href, label: t(section.label) }))}
    >
      {children}
    </SectionArea>
  );
}
