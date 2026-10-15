import { ProfileCard } from "@/components/profile-card";
import { requirePageUser } from "@/lib/auth/page-guard";

export const dynamic = "force-dynamic";

/** Sezione Profilo dell'account (T-2802): nome mostrato senza password ed email in sola lettura. */
export default async function AccountProfilePage() {
  const user = await requirePageUser();

  return <ProfileCard initial={{ email: user.email, displayName: user.displayName }} />;
}
