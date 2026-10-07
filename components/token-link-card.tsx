import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { NarrowCard } from "@/components/narrow-card";
import { readParam, type SearchParams } from "@/lib/http/search-params";

/**
 * Pagina pubblica aperta dal link con token di un'email (T-1403, T-1404): titolo, testo e form per il token, oppure il
 * messaggio del link incompleto. Il token resta nella pagina: Referrer-Policy no-referrer da next.config.ts.
 */
export async function TokenLinkCard({
  namespace,
  searchParams,
  form,
}: {
  namespace: "auth.verify" | "auth.reset";
  searchParams: Promise<SearchParams>;
  form: (token: string) => ReactNode;
}) {
  const token = readParam(await searchParams, "token");
  const t = await getTranslations(namespace);

  return (
    <NarrowCard title={t("title")} action={<LocaleSwitcher />}>
      <p className="text-sm text-slate-600">{token ? t("intro") : t("missingToken")}</p>
      {token && form(token)}
    </NarrowCard>
  );
}
