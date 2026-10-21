import { promises as dns } from "node:dns";
import { BlockList, isIP } from "node:net";

/*
 * Nomi host pubblici per le richieste verso indirizzi scelti dall'utente (T-4601, CWE-918): niente indirizzi IP scritti
 * nell'indirizzo, niente localhost, e prima di ogni richiesta il nome si risolve e si rifiuta se anche un solo
 * indirizzo è privato, di loopback, link-local o riservato. Gli IPv4 dentro un IPv6 (::ffff:a.b.c.d) seguono le regole
 * IPv4 (BlockList li confronta da sé).
 */

const BLOCKED = new BlockList();
const IPV4_RESERVED: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];
const IPV6_RESERVED: [string, number][] = [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
];
for (const [network, prefix] of IPV4_RESERVED) BLOCKED.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of IPV6_RESERVED) BLOCKED.addSubnet(network, prefix, "ipv6");

/** Nome host senza le parentesi di un IPv6 e senza il punto finale. */
const bareHost = (hostname: string) => hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();

/** Nome host scritto come indirizzo IP o come localhost: rifiutato già quando si salva il collegamento. */
export function isIpOrLocalHostname(hostname: string): boolean {
  const host = bareHost(hostname);
  return isIP(host) !== 0 || host === "localhost" || host.endsWith(".localhost");
}

/** true se l'indirizzo IP non è in nessuna delle reti riservate; un testo che non è un indirizzo IP è false. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return !BLOCKED.check(address, family === 4 ? "ipv4" : "ipv6");
}

/** true solo se il nome host si risolve e tutti i suoi indirizzi sono pubblici; un errore di DNS è false. */
export async function resolvesToPublicAddresses(hostname: string): Promise<boolean> {
  if (isIpOrLocalHostname(hostname)) return false;
  try {
    const records = await dns.lookup(bareHost(hostname), { all: true, verbatim: true });
    return records.length > 0 && records.every((record) => isPublicAddress(record.address));
  } catch {
    return false;
  }
}
