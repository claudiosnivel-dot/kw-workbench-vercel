import { type RefObject, useEffect, useRef } from "react";

// Elementi che ricevono il focus con Tab dentro una modale o un pannello (summary: le sezioni Avanzate, T-2406).
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
const FIELDS = "input:not([disabled]), select:not([disabled]), textarea:not([disabled])";

/** Elementi raggiungibili: quelli dentro una sezione chiusa (details) no, tranne il suo summary. */
function visible(elements: NodeListOf<HTMLElement>): HTMLElement[] {
  return [...elements].filter((element) => {
    const closed = element.closest("details:not([open])");
    return !closed || (element.tagName === "SUMMARY" && element.parentElement === closed);
  });
}

/** Primo campo attivo del contenitore, altrimenti il primo elemento attivabile. */
function initialFocusTarget(container: HTMLElement): HTMLElement | null {
  return visible(container.querySelectorAll<HTMLElement>(FIELDS))[0] ?? visible(container.querySelectorAll<HTMLElement>(FOCUSABLE))[0] ?? null;
}

/** Tab e Maiusc+Tab restano dentro il contenitore: dall'ultimo elemento si torna al primo e viceversa. */
function keepFocusInside(event: KeyboardEvent, container: HTMLElement): void {
  const focusable = visible(container.querySelectorAll<HTMLElement>(FOCUSABLE));
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

// Modali aperte, dalla prima all'ultima: solo l'ultima risponde a Esc e Tab.
const openModals: object[] = [];

/**
 * Comportamento comune di modali e pannelli a scomparsa (T-1104, T-2303): all'apertura il focus va al primo campo (o al
 * primo elemento attivabile), Tab resta dentro, Esc chiama onClose e la pagina sotto non scorre; alla chiusura il focus
 * torna all'elemento che aveva il focus all'apertura, di norma il pulsante che l'ha aperta. Con più modali aperte una
 * sopra l'altra (un dialogo aperto dal pannello di una pagina del piano, T-2505) Esc e Tab valgono solo per l'ultima
 * aperta, ed Esc già gestito da un menu dentro la modale (preventDefault) non la chiude.
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
    const token = {};
    openModals.push(token);

    const onKeyDown = (event: KeyboardEvent) => {
      if (openModals[openModals.length - 1] !== token) {
        return;
      }
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        onCloseRef.current();
      } else if (event.key === "Tab" && containerRef.current) {
        keepFocusInside(event, containerRef.current);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      openModals.splice(openModals.indexOf(token), 1);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [open, containerRef]);
}
