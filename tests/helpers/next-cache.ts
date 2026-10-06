/**
 * Cache dati di Next in memoria per i test d'integrazione (T-1105). Fuori dal server di Next unstable_cache e
 * revalidateTag non hanno l'incrementalCache e lanciano un'Invariant: qui si sostituiscono con una mappa che
 * rispetta chiavi e tag, svuotata prima di ogni test da tests/integration/setup.ts.
 */
type Entry = { value: unknown; tags: string[] };

const entries = new Map<string, Entry>();

export function clearNextCache(): void {
  entries.clear();
}

export function unstable_cache<A extends unknown[], R>(
  callback: (...args: A) => Promise<R>,
  keyParts: string[] = [],
  options: { tags?: string[]; revalidate?: number | false } = {}
): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    const key = JSON.stringify([callback.toString(), keyParts, args]);
    const hit = entries.get(key);
    if (hit) {
      return structuredClone(hit.value) as R;
    }

    const value = await callback(...args);
    // Come la cache di Next: si conserva la forma serializzata in JSON.
    entries.set(key, { value: JSON.parse(JSON.stringify(value)), tags: options.tags ?? [] });
    return value;
  };
}

export function revalidateTag(tag: string): void {
  for (const [key, entry] of entries) {
    if (entry.tags.includes(tag)) {
      entries.delete(key);
    }
  }
}

export function revalidatePath(): void {
  entries.clear();
}
