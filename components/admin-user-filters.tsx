"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/** Filtro a pulsante dell'elenco utenti: stato (attivi, sospesi) o ruolo (admin, solo per il root). */
export type AdminUserFilter = "ALL" | "ACTIVE" | "SUSPENDED" | "ADMIN";

export type AdminUsersTotals = {
  totalUsers: number;
  totalAdmins: number | null;
  totalSubscribers: number;
  totalActive: number;
  totalSuspended: number;
};

const SEARCH_DEBOUNCE_MS = 300;

type AdminUserFiltersProps = {
  totals: AdminUsersTotals | null;
  isRootAdmin: boolean;
  filter: AdminUserFilter;
  onFilterChange: (filter: AdminUserFilter) => void;
  /** Testo cercato, già ripulito, quando si smette di digitare. */
  onSearch: (searchText: string) => void;
};

/**
 * Ricerca e filtri dell'elenco utenti (T-3303): la ricerca con debounce di 300 ms (AC-507-4) e i totali di T-507 come
 * filtri a pulsante con il conteggio e aria-pressed. I filtri cambiano solo la richiesta: la visibilità resta della rotta.
 */
export function AdminUserFilters({ totals, isRootAdmin, filter, onFilterChange, onSearch }: AdminUserFiltersProps) {
  const t = useTranslations("admin.filters");
  const [searchText, setSearchText] = useState("");

  // Ricerca con debounce: parte una sola richiesta quando si smette di digitare.
  useEffect(() => {
    const timer = setTimeout(() => onSearch(searchText.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText, onSearch]);

  const filters: { value: AdminUserFilter; label: string; count: number | null | undefined }[] = [
    { value: "ALL", label: t("all"), count: totals?.totalUsers },
    { value: "ACTIVE", label: t("active"), count: totals?.totalActive },
    { value: "SUSPENDED", label: t("suspended"), count: totals?.totalSuspended },
    ...(isRootAdmin ? [{ value: "ADMIN" as const, label: t("admins"), count: totals?.totalAdmins }] : []),
  ];

  return (
    <div className="space-y-3">
      <div className="w-full lg:max-w-sm">
        <label className="label" htmlFor="admin-search">
          {t("search")}
        </label>
        <input
          id="admin-search"
          className="input"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder={t("searchPlaceholder")}
        />
      </div>

      <div role="group" aria-label={t("label")} className="keyword-chips">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            className={`keyword-chip ${filter === item.value ? "is-active" : ""}`}
            onClick={() => onFilterChange(item.value)}
          >
            {item.label} <span className="keyword-chip-count">{item.count ?? "-"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
