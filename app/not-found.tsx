import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { NarrowCard } from "@/components/narrow-card";

export default async function NotFound() {
  const t = await getTranslations("errorPages.notFound");
  return (
    <NarrowCard title={t("title")}>
      <p className="text-sm text-slate-600">{t("body")}</p>
      <Link href="/" className="btn-primary inline-block">
        {t("back")}
      </Link>
    </NarrowCard>
  );
}
