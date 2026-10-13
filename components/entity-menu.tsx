"use client";

import Link from "next/link";
import { useState } from "react";
import { ConfirmDeleteDialog, type ConfirmDeleteDialogProps } from "@/components/confirm-delete-dialog";
import { RenameDialog, type RenameDialogProps } from "@/components/rename-dialog";
import { useMenuButton } from "@/lib/client/use-menu-button";

/** Voce del menu: un'azione, un link, oppure Rinomina o Elimina con il loro dialogo. */
export type EntityMenuItem =
  | { kind: "action"; label: string; onSelect: () => void }
  | { kind: "link"; label: string; href: string }
  | { kind: "rename"; label: string; dialog: Omit<RenameDialogProps, "onClose"> }
  | { kind: "delete"; label: string; dialog: Omit<ConfirmDeleteDialogProps, "onClose"> };

/**
 * Menu ⋯ di un progetto (scheda della home, T-2305) o di un argomento (pagina delle keyword, T-2403), con il pattern menu
 * button di useMenuButton: le voci nell'ordine dato; Rinomina ed Elimina aprono i loro dialoghi, il rosso compare solo
 * nella voce Elimina e nel suo dialogo (D-39). I dialoghi stanno fuori dal contenitore del menu: i tasti dei loro campi
 * non devono muovere il menu.
 */
export function EntityMenu({ label, items }: { label: string; items: EntityMenuItem[] }) {
  const { open: menuOpen, close, onKeyDown, wrapperRef, buttonRef, menuRef, buttonProps, menuProps } = useMenuButton();
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const renameItem = items.find((item) => item.kind === "rename");
  const deleteItem = items.find((item) => item.kind === "delete");

  const select = (item: EntityMenuItem) => {
    close();
    if (item.kind === "action") item.onSelect();
    if (item.kind === "rename" || item.kind === "delete") setDialog(item.kind);
  };

  return (
    <>
      <div ref={wrapperRef} className="relative" onKeyDown={onKeyDown}>
        <button ref={buttonRef} {...buttonProps} aria-label={label} className="project-switcher-button">
          <span aria-hidden="true">⋯</span>
        </button>
        {menuOpen && (
          <div className="user-menu-popover">
            <div ref={menuRef} {...menuProps} aria-label={label} className="grid gap-0.5">
              {items.map((item) =>
                item.kind === "link" ? (
                  <Link key={item.label} href={item.href} role="menuitem" tabIndex={-1} className="user-menu-item" onClick={close}>
                    {item.label}
                  </Link>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    className={`user-menu-item ${item.kind === "delete" ? "text-red-700" : ""}`}
                    onClick={() => select(item)}
                  >
                    {item.label}
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>
      {dialog === "rename" && renameItem?.kind === "rename" && (
        <RenameDialog {...renameItem.dialog} onClose={() => setDialog(null)} />
      )}
      {dialog === "delete" && deleteItem?.kind === "delete" && (
        <ConfirmDeleteDialog {...deleteItem.dialog} onClose={() => setDialog(null)} />
      )}
    </>
  );
}
