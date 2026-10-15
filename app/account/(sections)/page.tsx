import { EmailChangeSection } from "@/components/email-change-section";
import { ProfileCard } from "@/components/profile-card";
import { getPendingEmailChange } from "@/lib/account/email-change";
import { requirePageUser } from "@/lib/auth/page-guard";
import { isEmailDeliveryAvailable } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * Sezione Profilo dell'account (T-2802, T-3002): nome mostrato senza password; email con «Cambia email» e la richiesta
 * in attesa di conferma, spento finché le email non partono (D-11).
 */
export default async function AccountProfilePage() {
  const user = await requirePageUser();
  const pending = await getPendingEmailChange(user.id);

  return (
    <>
      <ProfileCard initial={{ displayName: user.displayName }} />
      <EmailChangeSection
        email={user.email}
        pending={pending && { newEmail: pending.newEmail, expiresAt: pending.expiresAt.toISOString() }}
        emailDeliveryAvailable={isEmailDeliveryAvailable()}
      />
    </>
  );
}
