import { z } from "zod";
import { parseArticleBody } from "@/lib/articles/service";
import { expectOneRow, requireProjectAccess } from "@/lib/authz/workspace";
import { AppError } from "@/lib/http/errors";
import { ProjectNotFoundError } from "@/lib/modules/project-access";
import { parseSiteUrl } from "@/lib/modules/project-settings";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import { isIpOrLocalHostname, resolvesToPublicAddresses } from "@/lib/security/public-address";

/*
 * Collegamento di un progetto al suo sito WordPress (T-4601, D-46) con le password per le applicazioni dell'API REST,
 * senza plugin. La password si salva cifrata e non torna mai nelle risposte né nei log (CWE-312, CWE-532); ogni
 * richiesta va solo in https verso un nome host che si risolve in indirizzi pubblici, con un timeout e senza seguire
 * i redirect (CWE-918).
 */

const WP_TIMEOUT_MS = 10_000;

export type WordPressErrorCode = "WP_NOT_CONFIGURED" | "WP_AUTH_FAILED" | "WP_NOT_FOUND" | "WP_UNREACHABLE" | "WP_REJECTED";

const ERROR_MESSAGES: Record<WordPressErrorCode, string> = {
  WP_NOT_CONFIGURED: "Il progetto non è collegato a WordPress",
  WP_AUTH_FAILED: "WordPress ha rifiutato utente o password per le applicazioni",
  WP_NOT_FOUND: "Il sito non risponde come un WordPress con l'API REST",
  WP_UNREACHABLE: "Il sito WordPress non è raggiungibile",
  WP_REJECTED: "WordPress ha rifiutato la richiesta",
};

/** Contesto dei log: il nome dell'evento e l'id del progetto, mai l'indirizzo, l'utente o la password. */
export type WordPressLogContext = { event: string; projectId: string };

/** Errore dell'esito con il solo status di WordPress nel log; 409 senza collegamento, 502 per il sito. */
export function wordPressFailure(context: WordPressLogContext, status: number | null, code: WordPressErrorCode): AppError {
  logger.warn(context.event, { projectId: context.projectId, status, outcome: code });
  return new AppError(code === "WP_NOT_CONFIGURED" ? 409 : 502, code, ERROR_MESSAGES[code]);
}

/** Campi del collegamento letti con select: la password cifrata resta fuori dalle altre letture (lib/prisma.ts). */
export const WORDPRESS_SELECT = { wp_site_url: true, wp_username: true, wp_password_encrypted: true } as const;

type StoredConnection = { wp_site_url: string | null; wp_username: string | null; wp_password_encrypted: string | null };
export type WordPressConnection = { siteUrl: string; username: string; appPassword: string };

/** true se indirizzo, utente e password sono tutti salvati. */
export const isWordPressConfigured = (project: StoredConnection) =>
  Boolean(project.wp_site_url && project.wp_username && project.wp_password_encrypted);

/** Collegamento salvato con la password decifrata, oppure null se manca uno dei tre campi. */
export function connectionOf(project: StoredConnection): WordPressConnection | null {
  if (!project.wp_site_url || !project.wp_username || !project.wp_password_encrypted) return null;
  return { siteUrl: project.wp_site_url, username: project.wp_username, appPassword: decryptSecret(project.wp_password_encrypted) };
}

/** Collegamento per il blocco delle impostazioni (T-4601) di un progetto già autorizzato: la password mai. */
export async function readWordPressSettings(projectId: string): Promise<{ siteUrl: string; username: string; configured: boolean }> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: WORDPRESS_SELECT });
  return { siteUrl: project.wp_site_url ?? "", username: project.wp_username ?? "", configured: isWordPressConfigured(project) };
}

const connectionSchema = z.strictObject({
  siteUrl: z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (URL.canParse(value) && isIpOrLocalHostname(new URL(value).hostname)) {
        ctx.addIssue({ code: "custom", message: "un nome host pubblico, non un indirizzo IP né localhost" });
        return z.NEVER;
      }
      return parseSiteUrl(value, ctx);
    }),
  username: z.string().trim().min(1, "obbligatorio").max(120, "al massimo 120 caratteri"),
  appPassword: z
    .string()
    .transform((value) => value.replace(/\s+/g, ""))
    .pipe(z.string().regex(/^[A-Za-z0-9]{24}$/, "24 lettere o cifre")),
});

/** Stato del collegamento nelle risposte: indirizzo e utente, della password solo se è configurata. */
export type WordPressConnectionView = { siteUrl: string; username: string; configured: true };

/**
 * PUT del collegamento (T-4601) con project.update: indirizzo, utente e password per le applicazioni senza spazi,
 * cifrata. Con un indirizzo diverso da quello salvato le bozze degli articoli sono di un altro sito: i loro id si
 * tolgono, così un invio non aggiorna mai l'articolo di un sito diverso.
 */
export async function saveWordPressConnection(actor: { id: string }, projectId: string, body: unknown): Promise<WordPressConnectionView> {
  const project = await requireProjectAccess(actor, projectId, "project.update", { wp_site_url: true });
  const input = parseArticleBody(connectionSchema, body);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.project.updateMany({
      where: { id: project.id, ...project.perimeter },
      data: { wp_site_url: input.siteUrl, wp_username: input.username, wp_password_encrypted: encryptSecret(input.appPassword) },
    });
    expectOneRow(count, () => new ProjectNotFoundError());
    if (project.wp_site_url !== input.siteUrl) {
      await tx.article.updateMany({ where: { project_id: project.id }, data: { wp_post_id: null, wp_post_url: null } });
    }
  });
  return { siteUrl: input.siteUrl, username: input.username, configured: true };
}

/** DELETE del collegamento (T-4601) con project.update: cancella i tre campi e gli id delle bozze degli articoli. */
export async function deleteWordPressConnection(actor: { id: string }, projectId: string): Promise<void> {
  const project = await requireProjectAccess(actor, projectId, "project.update", {});
  await prisma.$transaction([
    prisma.project.updateMany({
      where: { id: project.id, ...project.perimeter },
      data: { wp_site_url: null, wp_username: null, wp_password_encrypted: null },
    }),
    prisma.article.updateMany({ where: { project_id: project.id }, data: { wp_post_id: null, wp_post_url: null } }),
  ]);
}

/**
 * Richiesta all'API REST del sito ({siteUrl}/wp-json/wp/v2/{path}) con Basic auth: prima il nome host deve risolversi
 * in indirizzi pubblici, poi la richiesta parte con il timeout e i redirect non seguiti (la risposta 3xx torna al
 * chiamante). Indirizzo rifiutato, rete o timeout → WP_UNREACHABLE.
 */
export async function wordPressRequest(
  context: WordPressLogContext,
  connection: WordPressConnection,
  path: string,
  body?: unknown
): Promise<Response> {
  const url = new URL(`${connection.siteUrl}/wp-json/wp/v2/${path}`);
  if (url.protocol !== "https:" || !(await resolvesToPublicAddresses(url.hostname))) {
    throw wordPressFailure(context, null, "WP_UNREACHABLE");
  }
  const headers = new Headers({
    Accept: "application/json",
    Authorization: `Basic ${Buffer.from(`${connection.username}:${connection.appPassword}`, "utf8").toString("base64")}`,
  });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  try {
    return await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(WP_TIMEOUT_MS),
    });
  } catch {
    throw wordPressFailure(context, null, "WP_UNREACHABLE");
  }
}

/** Corpo JSON di una risposta di WordPress, oppure null se non è JSON. */
export async function wordPressJson<T>(response: Response): Promise<Partial<T> | null> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object" ? (value as Partial<T>) : null;
  } catch {
    return null;
  }
}

/** Esito della prova: il nome dell'utente WordPress e se può scrivere articoli (capabilities edit_posts). */
export type WordPressTestResult = { name: string; canEditPosts: boolean };

/**
 * «Prova collegamento» (T-4601) con project.update: GET users/me?context=edit. 200 con l'utente → ok; 401 o 403 →
 * WP_AUTH_FAILED; 404 o una risposta che non è un utente dell'API REST → WP_NOT_FOUND; il resto → WP_UNREACHABLE.
 */
export async function testWordPressConnection(actor: { id: string }, projectId: string): Promise<WordPressTestResult> {
  const project = await requireProjectAccess(actor, projectId, "project.update", WORDPRESS_SELECT);
  const context = { event: "wordpress_test", projectId: project.id };
  const connection = connectionOf(project);
  if (!connection) throw wordPressFailure(context, null, "WP_NOT_CONFIGURED");
  const response = await wordPressRequest(context, connection, "users/me?context=edit");
  if (response.status === 401 || response.status === 403) throw wordPressFailure(context, response.status, "WP_AUTH_FAILED");
  if (response.status === 404) throw wordPressFailure(context, response.status, "WP_NOT_FOUND");
  if (response.status !== 200) throw wordPressFailure(context, response.status, "WP_UNREACHABLE");
  const user = await wordPressJson<{ name: unknown; capabilities: Record<string, unknown> }>(response);
  if (!user || typeof user.name !== "string") throw wordPressFailure(context, response.status, "WP_NOT_FOUND");
  logger.info(context.event, { projectId: project.id, status: response.status, outcome: "ok" });
  return { name: user.name, canEditPosts: user.capabilities?.edit_posts === true };
}
