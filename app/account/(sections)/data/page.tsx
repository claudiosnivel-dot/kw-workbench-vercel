import { AccountDataCard } from "@/components/account-data-card";
import { requirePageUser } from "@/lib/auth/page-guard";

export const dynamic = "force-dynamic";

/** Sezione I tuoi dati dell'account (T-1804, T-2801): download dell'export JSON e cancellazione con la password. */
export default async function AccountDataPage() {
  await requirePageUser();

  return <AccountDataCard />;
}
