import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { buildApiErrorMessage } from "@/lib/client/http";
import { API_ERROR_CODES } from "@/lib/http/errors";
import en from "@/messages/en.json";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("buildApiErrorMessage", () => {
  // covers: AC-1303-4
  it("per un code noto restituisce il testo del catalogo, per uno sconosciuto errors.UNKNOWN con lo status", () => {
    const t = createTranslator({ locale: "en", messages: en, namespace: "errors" });
    const code = API_ERROR_CODES[0];

    const known = buildApiErrorMessage(jsonResponse(404, {}), { error: "Testo del server", code }, t);
    const unknown = buildApiErrorMessage(jsonResponse(500, {}), { error: "boom", code: "XYZ" }, t);

    expect(known).toBe(en.errors[code]);
    expect(known).not.toContain("Testo del server");
    expect(unknown).toBe(t("UNKNOWN", { status: 500 }));
    expect(unknown).toContain("500");
    expect(unknown).not.toContain("boom");
  });
});
