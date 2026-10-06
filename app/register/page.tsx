import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { NarrowCard } from "@/components/narrow-card";
import { RegisterForm } from "@/components/register-form";
import { isPublicSignupEnabled } from "@/lib/auth/config";
import { getOptionalAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { safeNextPath } from "@/lib/auth/safe-next-path";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
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
  const signupEnabled = isPublicSignupEnabled();
  const t = await getTranslations("auth.register");

  return (
    <NarrowCard title={t("title")} action={<LocaleSwitcher />}>
      {signupEnabled ? (
        <>
          <p className="text-sm text-slate-600">{t("subtitle")}</p>
          <RegisterForm nextPath={nextPath} />
        </>
      ) : (
        <>
          <p className="text-sm text-slate-600">{t("disabled")}</p>
          <Link href="/login" className="btn-secondary w-full text-center sm:w-auto">
            {t("goToLogin")}
          </Link>
        </>
      )}
    </NarrowCard>
  );
}
