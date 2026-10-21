import { promises as dns } from "node:dns";
import type { LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";
import { isIpOrLocalHostname, isPublicAddress } from "@/lib/security/public-address";

/*
 * Fetch agli indirizzi controllati (T-5401, D-51; CWE-918, CWE-367): il nome host si risolve una volta per connessione
 * nel lookup del socket, la connessione si rifiuta se anche un solo indirizzo non è ammesso e altrimenti va solo agli
 * indirizzi di quella risoluzione. Fra il controllo e la connessione non c'è una seconda risoluzione che un DNS ostile
 * possa cambiare (DNS rebinding). Fetch e Agent vengono dallo stesso pacchetto undici: il fetch globale di Node usa un
 * undici suo, di un'altra versione.
 */

/** Fetch con un URL come input: una Request globale è dell'undici di Node, non di questo. */
export type PinnedFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

/** Indirizzo rifiutato, senza il nome host né gli indirizzi nel messaggio (CWE-532). */
class AddressNotAllowedError extends Error {
  override name = "AddressNotAllowedError";

  constructor() {
    super("Indirizzo non consentito per la connessione");
  }
}

/** Lookup del socket: una risoluzione con tutti gli indirizzi, rifiutata se uno non soddisfa isAllowed. */
function verifiedLookup(isAllowed: (address: string) => boolean): LookupFunction {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { all: true, verbatim: true }).then(
      (records) => {
        const allowed = records.length > 0 && records.every((record) => isAllowed(record.address));
        if (!allowed) return callback(new AddressNotAllowedError(), "");
        if (options.all) return callback(null, records);
        callback(null, records[0].address, records[0].family);
      },
      (error: NodeJS.ErrnoException) => callback(error, "")
    );
  };
}

/**
 * Fetch con la connessione solo agli indirizzi ammessi da isAllowed. Un indirizzo IP scritto nell'URL non passa dal
 * lookup, quindi si rifiuta prima di connettersi, come localhost.
 */
export function createPinnedFetch({ isAllowed }: { isAllowed: (address: string) => boolean }): PinnedFetch {
  const dispatcher = new Agent({ connect: { lookup: verifiedLookup(isAllowed) } });
  return async (input, init) => {
    const url = new URL(input);
    if (isIpOrLocalHostname(url.hostname)) throw new AddressNotAllowedError();
    const response = await undiciFetch(url, { ...(init as UndiciRequestInit | undefined), dispatcher });
    return response as unknown as Response;
  };
}

/** Fetch verso indirizzi scelti dall'utente: solo indirizzi pubblici, con le reti riservate di T-4601. */
export const pinnedFetch = createPinnedFetch({ isAllowed: isPublicAddress });
