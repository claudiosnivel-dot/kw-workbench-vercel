"use client";

import { useTranslations } from "next-intl";
import type { SelectHTMLAttributes } from "react";

const SEARCH_INTENTS = ["informational", "commercial", "transactional", "navigational", "mixed"] as const;
const KEYWORD_TYPES = ["generic", "question", "comparison", "branded", "local", "tool", "service", "product", "content_topic"] as const;

type ClassificationSelectProps = {
  kind: "intent" | "type";
  label: string;
  /** Prima voce, senza valore: nessun filtro. */
  anyLabel: string;
} & SelectHTMLAttributes<HTMLSelectElement>;

/**
 * Select dell'intento di ricerca o del tipo di keyword con la sua etichetta (impostazioni esperte della strategia, T-1905;
 * pannello Filtri delle keyword, T-2403): le voci hanno le etichette del catalogo dei risultati.
 */
export function ClassificationSelect({ kind, label, anyLabel, ...select }: ClassificationSelectProps) {
  const tResults = useTranslations("results");
  const values: readonly string[] = kind === "intent" ? SEARCH_INTENTS : KEYWORD_TYPES;

  return (
    <label className="block">
      <span className="label">{label}</span>
      <select className="select" {...select}>
        <option value="">{anyLabel}</option>
        {values.map((value) => (
          <option key={value} value={value}>
            {tResults(`${kind}.${value}` as Parameters<typeof tResults>[0])}
          </option>
        ))}
      </select>
    </label>
  );
}
