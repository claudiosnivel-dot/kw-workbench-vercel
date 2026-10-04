import { redirect } from "next/navigation";
import { isAdminUser } from "@/lib/auth/current-user";
import { requirePageUser } from "@/lib/auth/page-guard";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const user = await requirePageUser();

  if (isAdminUser(user)) {
    redirect("/admin");
  }

  redirect("/");
}
