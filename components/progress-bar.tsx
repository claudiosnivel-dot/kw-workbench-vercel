"use client";

import { useEffect, useRef } from "react";

/**
 * Barra di avanzamento di una ricerca (T-1205, T-2404): role progressbar con done su total. La larghezza si imposta dal
 * DOM e non con l'attributo style: la CSP non ammette stili inline (T-505).
 */
export function ProgressBar({ label, done, total }: { label: string; done: number; total: number }) {
  const barRef = useRef<HTMLDivElement>(null);
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  useEffect(() => {
    if (barRef.current) {
      barRef.current.style.width = `${percent}%`;
    }
  }, [percent]);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuenow={done}
      aria-valuemax={total}
      className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]"
    >
      <div ref={barRef} className="h-full w-0 bg-[var(--brand-500)] transition-[width]" />
    </div>
  );
}
