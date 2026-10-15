// Gate di T-3102 (AC-3102-3): il banner del pagamento scaduto e l'invito all'upgrade portano l'OWNER alla sezione Piano
// del workspace, non più a /billing.
import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PastDueBanner } from "@/components/past-due-banner";
import { PlanLimitNotice } from "@/components/plan-limit-notice";
import { PLAN_LIMIT_EVENT } from "@/lib/client/http";
import { renderWithIntl } from "./intl";

/** href dei link dentro l'elemento. */
function linkHrefs(element: HTMLElement): (string | null)[] {
  return [...element.querySelectorAll("a")].map((link) => link.getAttribute("href"));
}

describe("link della fatturazione negli avvisi del piano", () => {
  // covers: AC-3102-3
  it("il banner del pagamento scaduto e l'avviso del limite hanno un link a /workspace/plan e nessuno a /billing", () => {
    renderWithIntl(<PastDueBanner graceEndsAt="2026-10-20T00:00:00.000Z" canManageBilling />);
    renderWithIntl(<PlanLimitNotice canManageBilling />);
    act(() => {
      window.dispatchEvent(new Event(PLAN_LIMIT_EVENT));
    });

    for (const notice of [screen.getByTestId("billing-past-due-banner"), screen.getByTestId("plan-limit-notice")]) {
      const hrefs = linkHrefs(notice);
      expect(hrefs.filter((href) => href === "/workspace/plan")).toHaveLength(1);
      expect(hrefs.filter((href) => href === "/billing")).toHaveLength(0);
    }
  });
});
