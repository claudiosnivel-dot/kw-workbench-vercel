"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

export type StatusCounts = { todo: number; writing: number; published: number };

/** Segmento della barra: la larghezza si imposta dal DOM, la CSP non ammette stili inline (T-505). */
function Segment({ className, part, total }: { className: string; part: number; total: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.width = `${total > 0 ? (part / total) * 100 : 0}%`;
    }
  }, [part, total]);
  return <span ref={ref} className={`plan-progress-segment ${className}`} />;
}

/**
 * Avanzamento della scrittura del piano (T-2504): barra a segmenti (pubblicate, in scrittura, da scrivere) e testo
 * «N pubblicate · N in scrittura · N da scrivere». Nella home e nella barra laterale basta il testo (T-2506).
 */
export function PlanProgress({ counts, compact = false }: { counts: StatusCounts; compact?: boolean }) {
  const t = useTranslations("plan.progress");
  const total = counts.todo + counts.writing + counts.published;
  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"} data-testid="plan-progress">
      <div
        role="progressbar"
        aria-label={t("label")}
        aria-valuemin={0}
        aria-valuenow={counts.published}
        aria-valuemax={total}
        className="plan-progress"
      >
        <Segment className="is-published" part={counts.published} total={total} />
        <Segment className="is-writing" part={counts.writing} total={total} />
      </div>
      {!compact && <p className="text-sm text-slate-600">{t("text", counts)}</p>}
    </div>
  );
}
