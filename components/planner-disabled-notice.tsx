/** Avviso di T-304: il provider Google Keyword Planner è spento (il testo lo aggiorna T-905). */
export function PlannerDisabledNotice() {
  return (
    <p className="rounded-xl border border-amber-400/40 bg-amber-500/15 p-3 text-sm text-amber-200">
      Volumi Google Ads non disponibili: importa il CSV di Keyword Planner
    </p>
  );
}
