// T-3704 (D-45): motivo dei volumi mancanti letto dal result del job, prima l'errore del fornitore e poi il notice.
import { describe, expect, it } from "vitest";
import { volumesReasonOf } from "@/lib/modules/volumes-reason";

describe("volumesReasonOf", () => {
  it("legge metricsProviderError prima di metricsNotice e ignora i result senza motivo", () => {
    expect(volumesReasonOf({ metricsProviderError: { httpStatus: 403, code: 40104 }, metricsNotice: "RUN_BUDGET_EXCEEDED" })).toEqual({
      kind: "provider",
      code: 40104,
    });
    expect(volumesReasonOf({ metricsProviderError: { httpStatus: null, code: null } })).toEqual({ kind: "provider", code: null });
    expect(volumesReasonOf({ metricsNotice: "RUN_BUDGET_EXCEEDED" })).toEqual({ kind: "notice", notice: "RUN_BUDGET_EXCEEDED" });
    expect(volumesReasonOf({ queries: 3 })).toBeNull();
    expect(volumesReasonOf(null)).toBeNull();
  });
});
