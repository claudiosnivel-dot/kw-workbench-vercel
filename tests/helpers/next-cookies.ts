/**
 * cookies() di next/headers per i test d'integrazione (T-1504). Fuori dal server di Next non c'è la richiesta da cui
 * leggere i cookie: le pagine rese nei test (dashboard, progetto) leggono questa mappa, che i test riempiono con
 * setRequestCookie. Registrato da tests/integration/setup.ts, mappa vuota a ogni test.
 */
const jar = new Map<string, string>();

export function setRequestCookie(name: string, value: string): void {
  jar.set(name, value);
}

export function clearRequestCookies(): void {
  jar.clear();
}

export async function cookies() {
  return {
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) as string } : undefined),
    has: (name: string) => jar.has(name),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
  };
}
