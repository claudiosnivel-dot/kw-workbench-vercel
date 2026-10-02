const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Accetta solo un Postgres di test su host locale e restituisce l'URL.
 * I messaggi d'errore nominano l'host o la variabile, mai la password.
 */
export function assertLocalTestDatabase(url: string | undefined): string {
  if (!url) {
    throw new Error("TEST_DATABASE_URL non impostata: i test d'integrazione richiedono un Postgres locale");
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error("TEST_DATABASE_URL non è un URL valido");
  }

  if (!LOCAL_HOSTS.has(hostname)) {
    throw new Error(`TEST_DATABASE_URL punta all'host non locale ${hostname}: ammessi solo localhost, 127.0.0.1 e ::1`);
  }

  return url;
}
