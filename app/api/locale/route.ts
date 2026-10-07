import { NextResponse } from "next/server";
import { shouldUseSecureCookies } from "@/lib/auth/config";
import { getOptionalAuthenticatedUserFromRequest } from "@/lib/auth/current-user";
import { AppError, withApiErrors } from "@/lib/http/errors";
import { isSupportedLocale, LOCALE_COOKIE } from "@/lib/i18n/locale";
import { prisma } from "@/lib/prisma";

const LOCALE_COOKIE_MAX_AGE_SECONDS = 31_536_000;

/**
 * Salva la lingua scelta (T-1301): rotta pubblica, cookie kwb_locale per tutti e, con una sessione valida,
 * users.ui_locale dell'utente della sessione (mai un id dal body, CWE-639). Solo i letterali ammessi (CWE-22, CWE-79).
 */
export const POST = withApiErrors(async (request: Request) => {
  const body = (await request.json()) as { locale?: unknown } | null;
  const locale = body?.locale;
  if (!isSupportedLocale(locale)) {
    throw new AppError(400, "LOCALE_UNSUPPORTED", "Lingua non supportata");
  }

  const user = await getOptionalAuthenticatedUserFromRequest(request);
  if (user) {
    await prisma.user.update({ where: { id: user.id }, data: { ui_locale: locale }, select: { id: true } });
  }

  const response = NextResponse.json({ locale });
  response.cookies.set({
    name: LOCALE_COOKIE,
    value: locale,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: shouldUseSecureCookies(),
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
});
