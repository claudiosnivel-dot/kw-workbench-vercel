import { redirect } from "next/navigation";
import { isAdminUser, requireAuthenticatedUserFromCookies } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireAuthenticatedUserFromCookies();

  if (isAdminUser(user)) {
    redirect("/admin");
  }

  redirect("/");
}
