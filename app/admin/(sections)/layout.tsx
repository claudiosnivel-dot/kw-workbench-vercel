import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { SectionArea } from "@/components/section-area";
import { requireAdminPageUser } from "@/lib/admin/page-access";

/** Sezioni dell'area «Amministrazione», nell'ordine della navigazione; root indica quelle del solo root admin. */
const ADMIN_SECTIONS = [
  { href: "/admin", label: "overview", root: true },
  { href: "/admin/users", label: "users", root: false },
  { href: "/admin/settings", label: "settings", root: true },
  { href: "/admin/log", label: "log", root: true },
] as const;

/**
 * Area «Amministrazione» (T-3301, D-41): titolo e navigazione a sezioni comuni. Il root admin vede Panoramica, Utenti,
 * Impostazioni e Registro, l'admin non root la sola voce Utenti; gli altri utenti vanno alla home.
 */
export default async function AdminSectionsLayout({ children }: { children: ReactNode }) {
  const user = await requireAdminPageUser();
  const t = await getTranslations("admin.sections");

  return (
    <SectionArea
      title={t("title")}
      intro={t("intro")}
      navLabel={t("nav")}
      items={ADMIN_SECTIONS.filter((section) => user.isRootAdmin || !section.root).map((section) => ({
        href: section.href,
        label: t(section.label),
      }))}
    >
      {children}
    </SectionArea>
  );
}
