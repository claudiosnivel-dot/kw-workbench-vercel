// Gate di T-7501 (AC-7501-4, D-64): un piano preparato per Claude Code, con i risultati di Google come fonte e
// grouping_notice AGENT_PLAN, ha sopra il piano l'avviso che luoghi, concorrenti e angoli li valuta Claude Code, al posto
// di quello dell'AI non attiva; lo stesso testo in inglese e in spagnolo.
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { PlanGroupingNotice } from "@/components/plan/plan-grouping-notice";
import { APP_TIME_ZONE } from "@/lib/i18n/locale";
import en from "@/messages/en.json";
import esES from "@/messages/es-ES.json";
import { renderWithIntl } from "./intl";

const AGENT_GROUPING = { source: "SERP", notice: "AGENT_PLAN" } as const;

describe("avviso del piano di Claude Code", () => {
  // covers: AC-7501-4
  it("con SERP e AGENT_PLAN dice «Piano preparato per Claude Code: luoghi, concorrenti e angoli li valuta lui»", () => {
    renderWithIntl(<PlanGroupingNotice grouping={AGENT_GROUPING} />);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Raggruppamento con i risultati di Google");
    expect(notice).toHaveTextContent("Piano preparato per Claude Code: luoghi, concorrenti e angoli li valuta lui.");
    expect(notice).not.toHaveTextContent("L'AI non è attiva");
    expect(notice).not.toHaveTextContent("Le keyword sono raggruppate per le parole che hanno in comune");
  });

  it("ha il suo testo anche in inglese e in spagnolo", () => {
    for (const [locale, messages, text] of [
      ["en", en, "Plan prepared for Claude Code: it judges places, competitors and angles itself."],
      ["es-ES", esES, "Plan preparado para Claude Code: los lugares, la competencia y los ángulos los valora él."],
    ] as const) {
      const { unmount } = render(
        <NextIntlClientProvider locale={locale} messages={messages} timeZone={APP_TIME_ZONE}>
          <PlanGroupingNotice grouping={AGENT_GROUPING} />
        </NextIntlClientProvider>
      );
      expect(screen.getByRole("status")).toHaveTextContent(text);
      unmount();
    }
  });
});
