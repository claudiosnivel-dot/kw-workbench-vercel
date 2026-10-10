"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { StrategyKeywordView } from "@/lib/modules/strategy/types";

const UNASSIGNED = "__unassigned";

export type MoveDestination = { id: string; label: string };

type KeywordMoverProps = {
  keywords: StrategyKeywordView[];
  destinations: MoveDestination[];
  /** Nelle pagine si può spostare tra le non assegnate; nel riquadro Non assegnate no. */
  allowUnassigned: boolean;
  pending: boolean;
  onMove: (keywordIds: string[], targetPageId: string | null) => Promise<boolean>;
};

/**
 * Keyword di una pagina o delle non assegnate con la selezione e la scelta della destinazione (T-1905): lo spostamento
 * avviene con selezione e destinazione, senza trascinamento, ed è usabile da tastiera.
 */
export function KeywordMover({ keywords, destinations, allowUnassigned, pending, onMove }: KeywordMoverProps) {
  const t = useTranslations("strategy.ui");
  const selectId = useId();
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState("");

  const toggle = (id: string, checked: boolean) =>
    setSelected((current) => (checked ? [...current, id] : current.filter((item) => item !== id)));
  const move = async () => {
    if (await onMove(selected, target === UNASSIGNED ? null : target)) {
      setSelected([]);
      setTarget("");
    }
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-1 text-sm">
        {keywords.map((keyword) => (
          <li key={keyword.id} className="flex flex-wrap items-center gap-2">
            <input
              type="checkbox"
              aria-label={t("selectKeyword", { keyword: keyword.keyword })}
              checked={selected.includes(keyword.id)}
              onChange={(event) => toggle(keyword.id, event.target.checked)}
            />
            <span className={keyword.role === "MAIN" ? "font-semibold" : undefined}>{keyword.keyword}</span>
            {keyword.role === "MAIN" && <span className="status-chip">{t("mainBadge")}</span>}
            <span className="text-xs text-slate-500">
              {keyword.volume === null ? t("noVolume") : t("volume", { volume: keyword.volume })}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="block sm:min-w-[18rem]" htmlFor={selectId}>
          <span className="label">{t("moveTo")}</span>
          <select id={selectId} className="select" value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="" disabled>
              {t("moveTo")}
            </option>
            {allowUnassigned && <option value={UNASSIGNED}>{t("moveToUnassigned")}</option>}
            {destinations.map((destination) => (
              <option key={destination.id} value={destination.id}>
                {destination.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn-secondary"
          disabled={pending || selected.length === 0 || target === ""}
          onClick={() => void move()}
        >
          {pending ? t("working") : t("move")}
        </button>
      </div>
    </div>
  );
}
