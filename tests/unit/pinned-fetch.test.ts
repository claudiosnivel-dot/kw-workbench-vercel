// Gate di T-5401 (AC-5401-1, AC-5401-2, AC-5401-3): il fetch agli indirizzi controllati risolve il nome host una volta
// per connessione e si connette solo agli indirizzi di quella risoluzione; rifiuta se anche un solo indirizzo non è
// ammesso, e rifiuta prima di ogni connessione un indirizzo IP o localhost scritto nell'URL (CWE-918, CWE-367).
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinnedFetch, pinnedFetch } from "@/lib/security/pinned-fetch";
import { stubLookup } from "../helpers/dns";

const servers: Server[] = [];
/** Errore del rifiuto di un indirizzo, diretto o come causa dell'errore di fetch. */
const NOT_ALLOWED = { name: "AddressNotAllowedError" };

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.closeAllConnections();
          server.close(resolve);
        })
    )
  );
});

/** Server HTTP su 127.0.0.1 che risponde «pong» e tiene gli header di ogni richiesta ricevuta. */
async function loopbackServer(): Promise<{ port: number; received: IncomingHttpHeaders[] }> {
  const received: IncomingHttpHeaders[] = [];
  const server = createServer((request, response) => {
    received.push(request.headers);
    response.end("pong");
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { port: (server.address() as AddressInfo).port, received };
}

describe("fetch agli indirizzi controllati", () => {
  // covers: AC-5401-1
  it("si connette all'indirizzo della sua risoluzione, con l'header Host del nome, e risolve il nome una volta", async () => {
    const { port, received } = await loopbackServer();
    const lookup = stubLookup({ "pinned.test": ["127.0.0.1"] });
    const loopbackFetch = createPinnedFetch({ isAllowed: (address) => address === "127.0.0.1" });

    const response = await loopbackFetch(`http://pinned.test:${port}/ping`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("pong");
    expect(received.map((headers) => headers.host)).toEqual([`pinned.test:${port}`]);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup.mock.calls[0][0]).toBe("pinned.test");
  });

  // covers: AC-5401-2
  it("rifiuta un nome host con un indirizzo pubblico e uno privato nella stessa risoluzione", async () => {
    const lookup = stubLookup({ "wp.example.test": ["93.184.216.34", "10.0.0.5"] });

    await expect(pinnedFetch("https://wp.example.test/wp-json/wp/v2/users/me")).rejects.toMatchObject({ cause: NOT_ALLOWED });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  // covers: AC-5401-3
  it("rifiuta un indirizzo IP o localhost scritto nell'URL senza risolvere nulla", async () => {
    const lookup = stubLookup({});

    await expect(pinnedFetch("https://10.0.0.5/")).rejects.toMatchObject(NOT_ALLOWED);
    await expect(pinnedFetch("https://localhost/")).rejects.toMatchObject(NOT_ALLOWED);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("anche con un isAllowed che accetta tutto, un indirizzo IP nell'URL è rifiutato: il lookup non lo controllerebbe", async () => {
    const { port, received } = await loopbackServer();
    const lookup = stubLookup({});
    const anyFetch = createPinnedFetch({ isAllowed: () => true });

    await expect(anyFetch(`http://127.0.0.1:${port}/ping`)).rejects.toMatchObject(NOT_ALLOWED);
    await expect(anyFetch(`http://[::1]:${port}/ping`)).rejects.toMatchObject(NOT_ALLOWED);
    expect(received).toEqual([]);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("un nome che non si risolve è rifiutato", async () => {
    const lookup = stubLookup({});

    await expect(pinnedFetch("https://sparito.example.test/")).rejects.toMatchObject({ cause: { code: "ENOTFOUND" } });
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});
