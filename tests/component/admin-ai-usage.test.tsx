// Gate di T-3902 (AC-3902-2) e di T-3903 (AC-3903-1, AC-3903-2): avvisi della Panoramica dell'amministrazione per il
// root admin sul limite giornaliero dell'account OpenRouter, sui modelli disponibili per l'AI e sulle richieste
// rifiutate da DataForSEO. In più la tabella «Uso dei modelli» della card «Titoli con l'AI» (T-3902).
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminAlerts } from "@/components/admin-alerts";
import { AiTitlesSettingsCard } from "@/components/admin-ai-titles-card";
import type { AdminAlertsData } from "@/lib/admin/alerts-types";
import { renderWithIntl } from "./intl";

const CARD_HREF = "/admin/settings#ai-titles";
const QUIET: AdminAlertsData = { aiDailyLimit: false, aiModelStatuses: ["ok", "ok", "ok", "ok", "ok"], dataForSeo: { failed: 0, lastCode: null } };

const alerts = () => screen.queryAllByTestId("admin-alert");

describe("avvisi dell'AI nella Panoramica", () => {
  // covers: AC-3902-2
  it("limite giornaliero raggiunto e 4 modelli disponibili danno due avvisi con il link alla card; altrimenti nessuno", () => {
    const { unmount } = renderWithIntl(
      <AdminAlerts data={{ ...QUIET, aiDailyLimit: true, aiModelStatuses: ["ok", "ok", "ok", "ok"] }} isRootAdmin />
    );

    expect(alerts()).toHaveLength(2);
    expect(alerts()[0]).toHaveTextContent("Le richieste gratuite dell'account sono finite almeno una volta nelle ultime 24 ore");
    expect(alerts()[1]).toHaveTextContent("Meno di 5 modelli disponibili per l'AI");
    for (const alert of alerts()) {
      expect(within(alert).getByRole("link", { name: "Apri «Titoli con l'AI»" })).toHaveAttribute("href", CARD_HREF);
    }
    unmount();

    renderWithIntl(<AdminAlerts data={QUIET} isRootAdmin />);
    expect(alerts()).toHaveLength(0);
    expect(screen.queryByTestId("admin-alerts")).toBeNull();
  });

  it("i modelli da verificare contano come disponibili, quelli non più nel catalogo no", () => {
    const { unmount } = renderWithIntl(<AdminAlerts data={{ ...QUIET, aiModelStatuses: ["ok", "ok", "ok", "unknown", "unknown"] }} isRootAdmin />);
    expect(alerts()).toHaveLength(0);
    unmount();

    renderWithIntl(<AdminAlerts data={{ ...QUIET, aiModelStatuses: ["ok", "ok", "ok", "ok", "missing"] }} isRootAdmin />);
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]).toHaveTextContent("Meno di 5 modelli disponibili per l'AI");
  });
});

describe("avviso di DataForSEO nella Panoramica", () => {
  const rejected: AdminAlertsData = { ...QUIET, dataForSeo: { failed: 2, lastCode: 40104 } };

  // covers: AC-3903-1
  it("con 2 richieste rifiutate e l'ultima con 40104 dice quante e il motivo dell'account da verificare", () => {
    renderWithIntl(<AdminAlerts data={rejected} isRootAdmin />);

    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]).toHaveTextContent("DataForSEO ha rifiutato 2 richieste nelle ultime 24 ore");
    expect(alerts()[0]).toHaveTextContent("L'account DataForSEO va verificato");
    expect(within(alerts()[0]).queryByRole("link")).toBeNull();
  });

  it("una sola richiesta rifiutata al singolare; senza codice il motivo è la mancata risposta", () => {
    renderWithIntl(<AdminAlerts data={{ ...QUIET, dataForSeo: { failed: 1, lastCode: null } }} isRootAdmin />);

    expect(alerts()[0]).toHaveTextContent("DataForSEO ha rifiutato 1 richiesta nelle ultime 24 ore");
    expect(alerts()[0]).toHaveTextContent("DataForSEO non ha risposto in tempo");
  });

  // covers: AC-3903-2
  it("senza richieste rifiutate, o con un admin non root, non c'è l'avviso di DataForSEO", () => {
    const { unmount } = renderWithIntl(<AdminAlerts data={QUIET} isRootAdmin />);
    expect(screen.queryByText(/DataForSEO ha rifiutato/)).toBeNull();
    unmount();

    renderWithIntl(<AdminAlerts data={{ ...rejected, aiDailyLimit: true }} isRootAdmin={false} />);
    expect(screen.queryByText(/DataForSEO ha rifiutato/)).toBeNull();
    expect(alerts()).toHaveLength(0);
  });
});

describe("uso dei modelli nella card", () => {
  const counts = (requests: number, ok: number, providerBusy: number, avgOkMs: number | null) => ({
    requests,
    ok,
    providerBusy,
    accountDailyLimit: 0,
    other: requests - ok - providerBusy,
    avgOkMs,
  });
  const view = {
    enabled: true,
    models: ["a/uno:free"],
    platformDailyRequests: 900,
    workspaceDailyLimit: 10,
    keyConfigured: true,
    catalog: { checkedAt: new Date().toISOString(), free: [{ id: "a/uno:free", name: "A: Uno", contextLength: 8192 }] },
    statuses: { "a/uno:free": "ok" as const },
    addable: [],
    usage: {
      models: [
        { model: "a/uno:free", last24h: counts(4, 3, 1, 3000), last7d: counts(9, 7, 2, 2500) },
        { model: "a/due:free", last24h: counts(0, 0, 0, null), last7d: counts(2, 2, 0, 6000) },
      ],
      requests24h: 4,
      limit: 900,
    },
  };

  it("mostra le richieste contate dal tetto e una tabella per le 24 ore e una per i 7 giorni", () => {
    renderWithIntl(<AiTitlesSettingsCard initial={view} />);

    expect(screen.getByText("Richieste nelle ultime 24 ore: 4 su 900")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Uso dei modelli" })).toBeVisible();
    const [day, week] = screen.getAllByRole("table");
    expect(within(day).getByText("Ultime 24 ore")).toBeVisible();
    expect(within(week).getByText("Ultimi 7 giorni")).toBeVisible();
    const uno = within(day).getByRole("row", { name: /a\/uno:free/ });
    expect(within(uno).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["4", "3", "1", "0", "0", "3 s"]);
    const due = within(day).getByRole("row", { name: /a\/due:free/ });
    expect(within(due).getAllByRole("cell").at(-1)).toHaveTextContent("—");
    expect(within(within(week).getByRole("row", { name: /a\/uno:free/ })).getAllByRole("cell")[0]).toHaveTextContent("9");
    expect(screen.getByLabelText("Tetto della piattaforma (richieste in 24 ore)")).toHaveAttribute("max", "5000");
  });

  it("senza richieste negli ultimi 7 giorni dice che non ce ne sono", () => {
    renderWithIntl(<AiTitlesSettingsCard initial={{ ...view, usage: { models: [], requests24h: 0, limit: 900 } }} />);

    expect(screen.getByText("Nessuna richiesta ai modelli negli ultimi 7 giorni.")).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
