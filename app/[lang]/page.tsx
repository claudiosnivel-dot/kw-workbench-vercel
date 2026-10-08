import { Landing } from "@/components/marketing/landing";
import { type LangPageProps, marketingLocale, marketingMetadataFor } from "@/lib/marketing/page";

export const dynamic = "force-dynamic";
export const generateMetadata = marketingMetadataFor("home");

/** Landing pubblica su /it e /en (T-1801, D-28 emendata); / porta qui l'anonimo nella lingua del browser (proxy). */
export default async function LandingPage(props: LangPageProps) {
  return <Landing locale={await marketingLocale(props)} />;
}
