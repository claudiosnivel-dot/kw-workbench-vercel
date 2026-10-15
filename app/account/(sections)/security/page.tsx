import { LogoutEverywhereCard, PasswordCard } from "@/components/account-security-cards";
import { requirePageUser } from "@/lib/auth/page-guard";

export const dynamic = "force-dynamic";

/** Sezione Accesso dell'account (T-2802): cambio password con la password attuale ed «Esci da tutti i dispositivi». */
export default async function AccountSecurityPage() {
  await requirePageUser();

  return (
    <>
      <PasswordCard />
      <LogoutEverywhereCard />
    </>
  );
}
