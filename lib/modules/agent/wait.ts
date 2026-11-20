// Attesa dei lavori lunghi per Claude Code (T-7301, anti-obiettivo 6 di D-64): una chiamata rilegge lo stato ogni
// WAIT_POLL_MS per al massimo WAIT_MAX_MS, sotto la maxDuration della rotta /api/mcp, e Claude Code richiama finché il
// lavoro non è finito. Il modulo 75 la usa anche per i lavori di piano.

export const WAIT_POLL_MS = 3_000;
export const WAIT_MAX_MS = 50_000;

/** Orologio dell'attesa: i test lo sostituiscono per non aspettare 50 s veri. */
export const waitClock = {
  now: (): number => Date.now(),
  sleep: (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Rilegge con read finché finished dice di sì o finché non passano WAIT_MAX_MS: l'ultima lettura arriva allo scadere,
 * e l'esito dice se il lavoro è finito.
 */
export async function pollUntilFinished<T>(read: () => Promise<T>, finished: (value: T) => boolean): Promise<{ value: T; finished: boolean }> {
  const deadline = waitClock.now() + WAIT_MAX_MS;
  for (;;) {
    const value = await read();
    if (finished(value)) {
      return { value, finished: true };
    }
    const remaining = deadline - waitClock.now();
    if (remaining <= 0) {
      return { value, finished: false };
    }
    await waitClock.sleep(Math.min(WAIT_POLL_MS, remaining));
  }
}
