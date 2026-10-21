import { vi } from "vitest";
import { POST as sendRoute } from "@/app/api/projects/[id]/strategies/[strategyId]/pages/[pageId]/article/wordpress/route";
import { DELETE as deleteRoute, PUT as putRoute } from "@/app/api/projects/[id]/wordpress/route";
import { POST as testRoute } from "@/app/api/projects/[id]/wordpress/test/route";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/security/encryption";
import type { PlanPage } from "./ai-titles";
import { stubLookup } from "./dns";
import { callRoute } from "./http";

/*
 * Supporto dei test di WordPress (T-4601, T-4602): le rotte del collegamento e dell'invio, un collegamento salvato come
 * lo salva la PUT, il DNS simulato dei nomi host e le righe del logger catturate da stdout.
 */

/** Password per le applicazioni finta, scritta come la mostra WordPress: 24 caratteri a gruppi di 4. */
export const APP_PASSWORD = "aBcD 1234 eFgH 5678 iJkL 9012";
export const SITE_URL = "https://blog.esempio.it";

const projectUrl = (projectId: string) => `/api/projects/${projectId}/wordpress`;

export const putConnection = (cookie: string | undefined, projectId: string, body: unknown) =>
  callRoute(putRoute, { method: "PUT", url: projectUrl(projectId), cookie, params: { id: projectId }, body });

export const deleteConnection = (cookie: string | undefined, projectId: string) =>
  callRoute(deleteRoute, { method: "DELETE", url: projectUrl(projectId), cookie, params: { id: projectId } });

export const testConnection = (cookie: string | undefined, projectId: string) =>
  callRoute(testRoute, { method: "POST", url: `${projectUrl(projectId)}/test`, cookie, params: { id: projectId } });

export const sendToWordPress = (cookie: string | undefined, page: PlanPage) =>
  callRoute(sendRoute, {
    method: "POST",
    url: `/api/projects/${page.projectId}/strategies/${page.strategyId}/pages/${page.pageId}/article/wordpress`,
    cookie,
    params: { id: page.projectId, strategyId: page.strategyId, pageId: page.pageId },
  });

/** Collegamento salvato nel progetto come lo salva la PUT: password senza spazi, cifrata. */
export async function saveConnection(projectId: string, siteUrl = SITE_URL): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: { wp_site_url: siteUrl, wp_username: "redazione", wp_password_encrypted: encryptSecret(APP_PASSWORD.replaceAll(" ", "")) },
  });
}

/** DNS simulato: ogni nome host dell'elenco si risolve nell'indirizzo indicato, gli altri non esistono. */
export const stubDns = (addresses: Record<string, string>) =>
  stubLookup(Object.fromEntries(Object.entries(addresses).map(([hostname, address]) => [hostname, [address]])));

/** Righe scritte dal logger su stdout durante action. */
export async function captureLogs<T>(action: () => Promise<T>): Promise<{ result: T; logs: string }> {
  const lines: string[] = [];
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  });
  const result = await action().finally(() => stdout.mockRestore());
  return { result, logs: lines.join("") };
}

/** Basic auth attesa per l'utente 'redazione' e la password senza spazi. */
export const expectedAuthorization = () => `Basic ${Buffer.from(`redazione:${APP_PASSWORD.replaceAll(" ", "")}`).toString("base64")}`;
