"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useMemo } from "react";
import { type ApiErrorPayload, buildApiErrorMessage, messageOf, readJsonSafe, sendJson } from "@/lib/client/http";

/** Esiti di un lavoro o di una richiesta con un testo proprio degli articoli (article.errors). */
const ARTICLE_CODES = [
  "AI_BUSY",
  "AI_DAILY_LIMIT",
  "AI_UNAVAILABLE",
  "AI_INVALID_RESPONSE",
  "AI_NOT_CONFIGURED",
  "JOB_ALREADY_ACTIVE",
  "CANCELED",
  "INTERNAL_ERROR",
] as const;

type ArticleCode = (typeof ARTICLE_CODES)[number];

const isArticleCode = (code: unknown): code is ArticleCode => typeof code === "string" && (ARTICLE_CODES as readonly string[]).includes(code);

export type ArticleFailure = { ok: false; code: string | null; message: string; retryAfterSeconds: number | null };
export type ArticleResult<T> = { ok: true; data: T } | ArticleFailure;

/** Indirizzo dell'API dell'articolo di una pagina del piano (T-4002), con il percorso che segue. */
export const articleApiUrl = (projectId: string, strategyId: string, pageId: string, path = "") =>
  `/api/projects/${projectId}/strategies/${strategyId}/pages/${pageId}/article${path}`;

/**
 * Richieste dell'articolo dall'interfaccia (T-4401, T-4402): risposta { data } oppure code, messaggio già tradotto e,
 * per RATE_LIMITED, i secondi di attesa. Gli esiti del lavoro e JOB_ALREADY_ACTIVE hanno il testo degli articoli, gli
 * altri quello del catalogo errors, mai il messaggio del server (CWE-209). jobError dà il testo dell'error_code di un
 * articolo non riuscito; limited il messaggio di un 429 con l'ora in cui riprovare. Le funzioni restano le stesse tra un
 * render e l'altro, così il polling dell'editor non riparte a ogni render.
 */
export function useArticleRequests() {
  const t = useTranslations("article");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const format = useFormatter();

  return useMemo(() => {
    const send = async <T>(url: string, init?: { method: "POST" | "PATCH"; body: unknown }): Promise<ArticleResult<T>> => {
      try {
        const response = init ? await sendJson(init.method, url, init.body) : await fetch(url, { cache: "no-store" });
        const payload = await readJsonSafe<ApiErrorPayload & { data?: T; retryAfter?: number }>(response);
        if (response.ok && payload?.data !== undefined) return { ok: true, data: payload.data };
        const code = payload?.code ?? null;
        const retryAfter = Number(payload?.retryAfter ?? response.headers.get("Retry-After"));
        return {
          ok: false,
          code,
          message: isArticleCode(code) ? t(`errors.${code}`) : buildApiErrorMessage(response, payload, tErrors),
          retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
        };
      } catch (error) {
        return { ok: false, code: null, message: messageOf(error, tCommon("unexpectedError")), retryAfterSeconds: null };
      }
    };

    const limited = (failure: ArticleFailure, key: "start.rateLimited" | "editor.rewriteLimited") =>
      failure.code === "RATE_LIMITED" && failure.retryAfterSeconds !== null
        ? t(key, { time: format.dateTime(new Date(Date.now() + failure.retryAfterSeconds * 1000), { hour: "2-digit", minute: "2-digit" }) })
        : failure.message;

    const jobError = (code: string | null) => t(`errors.${isArticleCode(code) ? code : "INTERNAL_ERROR"}`);

    return { send, limited, jobError };
  }, [t, tErrors, tCommon, format]);
}
