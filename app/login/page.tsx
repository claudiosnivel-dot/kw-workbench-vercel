import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LoginForm } from "@/components/login-form";
import { NarrowCard } from "@/components/narrow-card";
import { getOptionalAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { safeNextPath } from "@/lib/auth/safe-next-path";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Solo un utente esistente e ACTIVE (letto dal DB) torna alla dashboard: non basta la firma del token.
  if (await getOptionalAuthenticatedUserFromCookies()) {
    redirect("/");
  }

  const params = await searchParams;
  const nextValue = params.next;
  const nextPath = safeNextPath(Array.isArray(nextValue) ? nextValue[0] : nextValue);
  const t = await getTranslations("auth.login");
  const noticeCode = loginNoticeCode(params.reason);

  return (
    <NarrowCard title={t("title")} action={<LocaleSwitcher />}>
      <p className="text-sm text-slate-600">{t("subtitle")}</p>
      {noticeCode && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {t(`notices.${noticeCode}`)}
        </p>
      )}
      <LoginForm nextPath={nextPath} />
    </NarrowCard>
  );
}

// Codici ammessi in ?reason=: il testo arriva solo dal catalogo, il valore dell'URL non viene mai mostrato (T-502).
const LOGIN_NOTICE_CODES = ["session_ended"] as const;
type LoginNoticeCode = (typeof LOGIN_NOTICE_CODES)[number];

function loginNoticeCode(reason: string | string[] | undefined): LoginNoticeCode | null {
  const code = Array.isArray(reason) ? reason[0] : reason;
  return LOGIN_NOTICE_CODES.find((allowed) => allowed === code) ?? null;
}
