"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { MenuChevron } from "@/components/menu-chevron";
import { useMenuButton } from "@/lib/client/use-menu-button";

type ProjectOption = { id: string; name: string };

/**
 * Progetto corrente nella barra in alto con il menu dei progetti del workspace (T-2304): i 10 con l'attività più
 * recente e «Tutti i progetti» verso la home. Stessa tastiera del menu dell'utente.
 */
export function ProjectSwitcher({ current, projects }: { current: ProjectOption; projects: ProjectOption[] }) {
  const t = useTranslations("nav");
  const { open, close, onKeyDown, wrapperRef, buttonRef, menuRef, buttonProps, menuProps } = useMenuButton();

  return (
    <div ref={wrapperRef} className="relative min-w-0" onKeyDown={onKeyDown}>
      <button ref={buttonRef} {...buttonProps} aria-label={t("projectMenu", { name: current.name })} className="project-switcher-button">
        <span className="truncate">{current.name}</span>
        <MenuChevron />
      </button>

      {open && (
        <div className="user-menu-popover is-start">
          <div ref={menuRef} {...menuProps} aria-label={t("recentProjects")} className="grid gap-0.5">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                role="menuitem"
                tabIndex={-1}
                aria-current={project.id === current.id ? "page" : undefined}
                className="user-menu-item"
                onClick={close}
              >
                <span className="truncate">{project.name}</span>
              </Link>
            ))}
            <div role="separator" className="user-menu-separator" />
            <Link href="/" role="menuitem" tabIndex={-1} className="user-menu-item" onClick={close}>
              {t("allProjects")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
