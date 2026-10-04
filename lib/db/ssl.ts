import type { ConnectionOptions } from "node:tls";

// Con l'adapter pg (T-403) il TLS verso il DB non è più quello di default del vecchio engine
// (sslmode=prefer): senza una scelta esplicita pg si collegherebbe in chiaro. Il pooler Supabase
// presenta una catena firmata da "Supabase Root 2021 CA", che non è tra le CA pubbliche di Node.

// CA radice pubblicata da Supabase (prod-ca-2021.crt), scadenza 2031-04-26,
// SHA-256 80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA.
export const SUPABASE_ROOT_CA_2021 = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----`;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

// Parametri dell'URL che il pool di pg non deve ricevere: quelli del vecchio engine di Prisma
// (connection_limit, pgbouncer, pool_timeout: limiti e attese arrivano da buildPoolConfig) e quelli
// TLS. pg-connection-string traduce sslmode=require in una verifica con le sole CA di sistema che
// sovrascrive l'opzione ssl del pool: sulla catena di Supabase la connessione fallirebbe.
const POOL_IGNORED_PARAMS = [
  "connection_limit",
  "pgbouncer",
  "pool_timeout",
  "sslmode",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "ssl",
  "sslnegotiation",
  "uselibpqcompat",
];

/**
 * TLS per il pool di pg: nessuno sui DB locali (sviluppo, test, CI), verifica completa altrove;
 * per gli host Supabase la verifica usa la CA di Supabase, per gli altri le CA di sistema.
 */
export function sslForDatabaseUrl(url: string | undefined): ConnectionOptions | false {
  let hostname: string;
  try {
    hostname = new URL(url ?? "").hostname.toLowerCase();
  } catch {
    return false;
  }

  if (LOCAL_HOSTS.has(hostname)) {
    return false;
  }
  if (hostname.endsWith(".supabase.com") || hostname.endsWith(".supabase.co")) {
    return { ca: SUPABASE_ROOT_CA_2021, rejectUnauthorized: true };
  }
  return { rejectUnauthorized: true };
}

/**
 * URL e TLS per il pool di pg: l'URL perde i parametri di POOL_IGNORED_PARAMS e il TLS segue
 * sslForDatabaseUrl; solo sslmode=disable, scelto esplicitamente nell'URL, lo spegne.
 */
export function poolConnection(url: string | undefined): {
  connectionString: string | undefined;
  ssl: ConnectionOptions | false;
} {
  let parsed: URL;
  try {
    parsed = new URL(url ?? "");
  } catch {
    return { connectionString: url, ssl: sslForDatabaseUrl(url) };
  }

  const sslDisabled = parsed.searchParams.get("sslmode") === "disable";
  for (const name of POOL_IGNORED_PARAMS) {
    parsed.searchParams.delete(name);
  }

  return { connectionString: parsed.toString(), ssl: sslDisabled ? false : sslForDatabaseUrl(url) };
}
