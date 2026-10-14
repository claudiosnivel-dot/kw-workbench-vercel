"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { CardIntro } from "@/components/card-intro";
import { sendJson } from "@/lib/client/http";
import { useRefreshAction } from "@/lib/client/use-refresh-action";

type Brand = { id: string; brand: string };

/**
 * Blocco «Marchi dei concorrenti» delle impostazioni (T-2601): un'etichetta con ✕ per marchio e il campo «+ aggiungi»
 * (Invio o pulsante). Ogni modifica si salva subito con la rotta dei marchi, vale anche per le keyword già trovate e
 * aggiorna la pagina, che riporta l'elenco salvato; l'errore resta sotto il campo con il testo del catalogo.
 */
export function ProjectBrands({ projectId, brands }: { projectId: string; brands: Brand[] }) {
  const t = useTranslations("projects.brands");
  const inputId = useId();
  const errorId = useId();
  const [draft, setDraft] = useState("");
  const { loading, error, run } = useRefreshAction();
  const endpoint = `/api/projects/${projectId}/brands`;

  const add = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.trim()) return;
    const failure = await run(() => sendJson("POST", endpoint, { brand: draft }));
    if (!failure) setDraft("");
  };

  return (
    <section className="card space-y-3">
      <CardIntro title={t("title")} intro={t("intro")} />
      {brands.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={t("title")}>
          {brands.map((brand) => (
            <li key={brand.id} className="keyword-seed">
              <span>{brand.brand}</span>
              <button
                type="button"
                className="keyword-seed-remove"
                aria-label={t("remove", { brand: brand.brand })}
                disabled={loading}
                onClick={() => void run(() => fetch(`${endpoint}/${brand.id}`, { method: "DELETE" }))}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">{t("empty")}</p>
      )}
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={add}>
        <label className="sr-only" htmlFor={inputId}>
          {t("addLabel")}
        </label>
        <input
          id={inputId}
          className="input sm:max-w-xs"
          value={draft}
          maxLength={100}
          placeholder={t("addPlaceholder")}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="btn-secondary" disabled={loading || !draft.trim()}>
          {t("add")}
        </button>
      </form>
      {error && (
        <p id={errorId} className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
