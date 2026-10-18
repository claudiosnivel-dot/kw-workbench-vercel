// Gate di T-3704 (AC-3704-1, D-45): le credenziali di DataForSEO si leggono senza spazi né a capo ai lati; una
// password fatta solo di spazi vale assente. Valori generati dal test, nessuna credenziale nel sorgente.
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getDataForSeoCredentials } from "@/lib/env";

describe("getDataForSeoCredentials", () => {
  // covers: AC-3704-1
  it("toglie spazi e a capo ai lati di login e password; una password di soli spazi vale assente", () => {
    const value = randomBytes(12).toString("hex");
    const cleaned = getDataForSeoCredentials({ DATAFORSEO_LOGIN: " utente@example.test ", DATAFORSEO_PASSWORD: `${value}\r\n` });
    const blank = getDataForSeoCredentials({ DATAFORSEO_LOGIN: "utente@example.test", DATAFORSEO_PASSWORD: " \t " });

    expect(cleaned).toEqual({ login: "utente@example.test", password: value });
    expect(blank).toBeNull();
  });
});
