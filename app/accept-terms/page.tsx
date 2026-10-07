import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AcceptTermsForm } from "@/components/accept-terms-form";
import { NarrowCard } from "@/components/narrow-card";
import { getOptionalAuthenticatedUserFromCookies } from "@/lib/auth/current-user";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { readParam, type SearchParams } from "@/lib/http/search-params";
import { hasAcceptedCurrentTerms } from "@/lib/legal/consent";
import { LEGAL_TERMS_VERSION } from "@/lib/legal/version";

export const dynamic = "force-dynamic";

/**
 * Riaccettazione dei termini (T-1405): unica pagina dell'app senza il gate dei termini (altrimenti reindirizzerebbe a
 * sé stessa). Senza utente attivo si chiude la sessione (T-502); con i termini già accettati si va a next.
 */
export default async function AcceptTermsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getOptionalAuthenticatedUserFromCookies();
  if (!user) {
    redirect("/api/auth/session-ended");
  }

  const nextPath = safeNextPath(readParam(await searchParams, "next"));
  if (hasAcceptedCurrentTerms(user)) {
    redirect(nextPath);
  }

  const t = await getTranslations("auth.terms");
  return (
    <NarrowCard title={t("title")}>
      <p className="text-sm text-slate-600">{t("intro")}</p>
      <AcceptTermsForm termsVersion={LEGAL_TERMS_VERSION} nextPath={nextPath} />
    </NarrowCard>
  );
}
