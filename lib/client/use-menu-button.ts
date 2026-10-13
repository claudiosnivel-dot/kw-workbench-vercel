import { type KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from "react";

// Voci del menu raggiungibili con le frecce.
const MENU_ITEMS = '[role="menuitem"], [role="menuitemradio"]';

/**
 * Pulsante che apre un menu a comparsa (T-2304, pattern menu button di WAI-ARIA): il pulsante ha aria-haspopup e
 * aria-expanded; freccia giù e su spostano il focus tra le voci (dal pulsante alla prima o all'ultima), Home e Fine
 * vanno agli estremi, Esc chiude il menu e restituisce il focus al pulsante, Tab o un clic fuori lo chiudono.
 */
export function useMenuButton() {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const focusItem = (pick: (items: HTMLElement[], current: number) => number) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>(MENU_ITEMS) ?? [])];
    if (items.length === 0) {
      return;
    }
    const current = items.findIndex((item) => item === document.activeElement);
    items[(pick(items, current) + items.length) % items.length]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }

    const moves: Record<string, (items: HTMLElement[], current: number) => number> = {
      ArrowDown: (_items, current) => current + 1,
      ArrowUp: (items, current) => (current < 0 ? items.length - 1 : current - 1),
      Home: () => 0,
      End: (items) => items.length - 1,
    };
    const move = moves[event.key];
    if (!move) {
      return;
    }
    event.preventDefault();
    if (!open) {
      setOpen(true);
      // Le voci esistono dopo il rendering del menu aperto.
      requestAnimationFrame(() => focusItem(move));
      return;
    }
    focusItem(move);
  };

  return {
    open,
    close,
    onKeyDown,
    wrapperRef,
    buttonRef,
    menuRef,
    buttonProps: {
      type: "button" as const,
      "aria-haspopup": "menu" as const,
      "aria-expanded": open,
      "aria-controls": open ? menuId : undefined,
      onClick: () => setOpen((current) => !current),
    },
    menuProps: { id: menuId, role: "menu" as const },
  };
}
