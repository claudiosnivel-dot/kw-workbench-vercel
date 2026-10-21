import dns from "node:dns";
import { vi } from "vitest";

/*
 * DNS simulato per i controlli degli indirizzi (T-4601, T-5401): spia su dns.promises.lookup, letto a ogni chiamata da
 * lib/security/public-address.ts e lib/security/pinned-fetch.ts.
 */

/** Indirizzi di un nome host, oppure la risposta alla chiamata n-esima per quel nome (da 1): un DNS che cambia idea. */
type Answer = string[] | ((call: number) => string[]);

/** Ogni nome host dell'elenco si risolve nei suoi indirizzi, gli altri non esistono (ENOTFOUND). */
export function stubLookup(answers: Record<string, Answer>) {
  const calls = new Map<string, number>();
  const lookup = async (hostname: string) => {
    const answer = answers[hostname];
    if (!answer) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${hostname}`), { code: "ENOTFOUND" });
    const call = (calls.get(hostname) ?? 0) + 1;
    calls.set(hostname, call);
    const addresses = typeof answer === "function" ? answer(call) : answer;
    return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
  return vi.spyOn(dns.promises, "lookup").mockImplementation(lookup as unknown as typeof dns.promises.lookup);
}
