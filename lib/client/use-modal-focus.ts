import { type RefObject, useEffect, useRef } from "react";

// Elementi che ricevono il focus con Tab dentro una modale o un pannello.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Primo campo del contenitore, altrimenti il primo elemento attivabile. */
function initialFocusTarget(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>("input, select, textarea") ?? container.querySelector<HTMLElement>(FOCUSABLE);
}

/** Tab e Maiusc+Tab restano dentro il contenitore: dall'ultimo elemento si torna al primo e viceversa. */
function keepFocusInside(event: KeyboardEvent, container: HTMLElement): void {
  const focusable = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)];
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !container.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Comportamento comune di modali e pannelli a scomparsa (T-1104, T-2303): all'apertura il focus va al primo campo (o al
 * primo elemento attivabile), Tab resta dentro, Esc chiama onClose e la pagina sotto non scorre; alla chiusura il focus
 * torna all'elemento che aveva il focus all'apertura, di norma il pulsante che l'ha aperta.
 */
export function useModalFocus(open: boolean, containerRef: RefObject<HTMLElement | null>, onClose: () => void): void {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = containerRef.current;
    if (container) {
      (initialFocusTarget(container) ?? container).focus();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
      } else if (event.key === "Tab" && containerRef.current) {
        keepFocusInside(event, containerRef.current);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [open, containerRef]);
}
