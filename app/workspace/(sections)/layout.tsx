import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { SectionArea } from "@/components/section-area";
import { requireCurrentWorkspace } from "@/lib/workspaces/current";

/** Sezioni dell'area «Workspace», nell'ordine della navigazione. */
const WORKSPACE_SECTIONS = [
  { href: "/workspace", label: "general" },
  { href: "/workspace/members", label: "members" },
  { href: "/workspace/plan", label: "plan" },
] as const;

/**
 * Area «Workspace» (T-3101, D-41): nome del workspace attivo, ruolo dell'utente e tipo (personale o di squadra), con la
 * navigazione a sezioni comune a Generale, Membri e Piano.
 */
export default async function WorkspaceSectionsLayout({ children }: { children: ReactNode }) {
  const { workspace } = await requireCurrentWorkspace();
  const t = await getTranslations("workspace");
  const kind = t(workspace.isPersonal ? "page.personal" : "page.team");

  return (
    <SectionArea
      title={workspace.name}
      intro={t("page.summary", { role: t(`roles.${workspace.role}`), kind })}
      navLabel={t("page.nav")}
      items={WORKSPACE_SECTIONS.map((section) => ({ href: section.href, label: t(`page.${section.label}`) }))}
    >
      {children}
    </SectionArea>
  );
}
