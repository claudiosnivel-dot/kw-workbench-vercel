"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExportDialog, type ExportOrigin } from "@/components/export-dialog";
import { ExportViewProvider, useExportView } from "@/components/export-view-context";
import { NewTopicDialog } from "@/components/new-topic-dialog";
import { NextStepBar } from "@/components/next-step-bar";
import { ProjectSidebar } from "@/components/project-sidebar";
import { ProjectSwitcher } from "@/components/project-switcher";
import { PROJECT_NAV_SLOT_ID } from "@/components/top-nav";
import { useModalFocus } from "@/lib/client/use-modal-focus";
import type { ProjectProgressData } from "@/lib/modules/next-step";

type ProjectShellProps = {
  project: { id: string; name: string };
  progress: ProjectProgressData;
  /** Progetti del workspace con l'attività più recente, per il menu dei progetti nella barra in alto. */
  recentProjects: { id: string; name: string }[];
  /** Per la finestra Esporta (T-2406): Google Sheets collegato e logo del branding per la copertina del PDF. */
  exportOptions: { sheetsConnected: boolean; hasLogo: boolean };
  children: ReactNode;
};

/** Contenitore della barra in alto, disponibile solo nel browser dopo il montaggio. */
function useNavSlot(): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById(PROJECT_NAV_SLOT_ID));
  }, []);
  return slot;
}

/** Pagina aperta per la finestra Esporta: argomento, vista del progetto o piano (T-2406). */
function exportOrigin(pathname: string, projectId: string): ExportOrigin {
  const base = `/projects/${projectId}`;
  if (pathname.startsWith(`${base}/keywords/`)) {
    return { kind: "topic", topicId: decodeURIComponent(pathname.slice(`${base}/keywords/`.length).split("/")[0]) };
  }
  return pathname.startsWith(`${base}/plan`) ? { kind: "plan" } : { kind: "project" };
}

/**
 * Finestra Esporta (T-2406) con la vista registrata dalla pagina. Sta fuori dalla barra in alto: il suo backdrop-filter
 * farebbe da contenitore alla posizione fissa del dialogo.
 */
function ExportDialogHost({ project, progress, exportOptions, onClose }: Pick<ProjectShellProps, "project" | "progress" | "exportOptions"> & {
  onClose: () => void;
}) {
  const pathname = usePathname();
  const view = useExportView();
  const latest = progress.latestStrategy;

  return (
    <ExportDialog
      projectId={project.id}
      projectName={project.name}
      origin={exportOrigin(pathname, project.id)}
      topics={progress.topics}
      keptCount={progress.keptCount}
      plan={view?.plan ?? (latest ? { strategyId: latest.id, pageCount: latest.pageCount } : null)}
      view={view?.keywords ?? null}
      sheetsConnected={exportOptions.sheetsConnected}
      hasLogo={exportOptions.hasLogo}
      onClose={onClose}
    />
  );
}

/**
 * Struttura comune delle pagine del progetto (T-2303, D-39): barra laterale a tappe a sinistra da 1024 px, pannello a
 * scomparsa dal pulsante ☰ della barra in alto sotto i 1024 px (focus trattenuto, Esc o clic fuori per chiudere, focus
 * restituito al pulsante), barra del prossimo passo in fondo all'area del contenuto e dialogo Nuovo argomento, aperto
 * dalla barra laterale o dalla barra del prossimo passo. Nella barra in alto anche il pulsante Esporta (T-2406).
 */
export function ProjectShell({ project, progress, recentProjects, exportOptions, children }: ProjectShellProps) {
  const t = useTranslations("nav");
  const tShell = useTranslations("project.shell");
  const pathname = usePathname();
  const slot = useNavSlot();
  const drawerId = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newTopicOpen, setNewTopicOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const tExport = useTranslations("exportDialog");

  const closeDrawer = () => setDrawerOpen(false);
  useModalFocus(drawerOpen, drawerRef, closeDrawer);

  // Un link della barra laterale porta a un'altra pagina: il pannello si chiude.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const addTopic = () => {
    setDrawerOpen(false);
    setNewTopicOpen(true);
  };

  const sidebar = (
    <ProjectSidebar projectId={project.id} progress={progress} onAddTopic={addTopic} />
  );

  return (
    <ExportViewProvider>
      {slot &&
        createPortal(
          <>
            <button
              type="button"
              className="top-nav-menu-toggle inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl lg:hidden"
              aria-label={t("projectNav")}
              aria-expanded={drawerOpen}
              aria-controls={drawerOpen ? drawerId : undefined}
              onClick={() => setDrawerOpen(true)}
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <ProjectSwitcher current={project} projects={recentProjects} />
            {/* Sotto i 640 px solo l'icona: la barra in alto ha posto per marchio, ☰, progetto e menu dell'utente. */}
            <button
              type="button"
              className="btn-secondary project-export-button shrink-0"
              aria-label={tExport("open")}
              onClick={() => setExportOpen(true)}
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 sm:hidden" aria-hidden="true">
                <path d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 14v2h12v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">{tExport("open")}</span>
            </button>
          </>,
          slot
        )}

      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <aside className="project-sidebar-shell hidden lg:block">{sidebar}</aside>
        <div className="min-w-0 space-y-6">
          {children}
          <NextStepBar projectId={project.id} progress={progress} onAddTopic={addTopic} />
        </div>
      </div>

      {drawerOpen && (
        <div className="modal-backdrop is-drawer lg:hidden" onClick={closeDrawer}>
          <div
            id={drawerId}
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={tShell("label")}
            className="project-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex justify-end">
              <button type="button" className="btn-secondary" onClick={closeDrawer}>
                {tShell("closeMenu")}
              </button>
            </div>
            {sidebar}
          </div>
        </div>
      )}

      {newTopicOpen && <NewTopicDialog projectId={project.id} onClose={() => setNewTopicOpen(false)} />}
      {exportOpen && (
        <ExportDialogHost project={project} progress={progress} exportOptions={exportOptions} onClose={() => setExportOpen(false)} />
      )}
    </ExportViewProvider>
  );
}
