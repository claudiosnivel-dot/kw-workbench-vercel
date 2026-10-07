/**
 * after() di next/server per i test d'integrazione (T-1403, T-1404). Fuori dal server di Next non c'è il contesto
 * della richiesta in cui after() registra le callback: qui si accodano e flushAfter() le esegue nell'ordine, come il
 * server dopo l'invio della risposta. Registrato da tests/integration/setup.ts, coda vuota a ogni test.
 */
type AfterTask = (() => unknown) | Promise<unknown>;

const pending: AfterTask[] = [];

export function after(task: AfterTask): void {
  pending.push(task);
}

export async function flushAfter(): Promise<void> {
  while (pending.length > 0) {
    const task = pending.shift() as AfterTask;
    await (typeof task === "function" ? task() : task);
  }
}

export function clearAfter(): void {
  pending.length = 0;
}
