import Link from "next/link";
import { useTranslations } from "next-intl";

type PaginationLinksProps = {
  /** null sulla prima pagina: il pulsante resta visibile ma inattivo. */
  previousHref: string | null;
  /** null sull'ultima pagina. */
  nextHref: string | null;
};

/** «Pagina precedente» e «Pagina successiva» della pagina dei risultati e della dashboard. */
export function PaginationLinks({ previousHref, nextHref }: PaginationLinksProps) {
  const t = useTranslations("common");
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {previousHref ? (
        <Link className="btn-secondary w-full text-center sm:w-auto" href={previousHref}>
          {t("previousPage")}
        </Link>
      ) : (
        <span className="btn-secondary w-full text-center opacity-60 sm:w-auto">{t("previousPage")}</span>
      )}
      {nextHref ? (
        <Link className="btn-secondary w-full text-center sm:w-auto" href={nextHref}>
          {t("nextPage")}
        </Link>
      ) : (
        <span className="btn-secondary w-full text-center opacity-60 sm:w-auto">{t("nextPage")}</span>
      )}
    </div>
  );
}
