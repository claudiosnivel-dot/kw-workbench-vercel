"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

type LogoutButtonProps = {
  className?: string;
  /** menuitem dentro il menu dell'utente (T-2304): stesso comportamento, senza lo stile del pulsante. */
  role?: "menuitem";
};

export function LogoutButton({ className, role }: LogoutButtonProps) {
  const t = useTranslations("auth.logout");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const logout = async () => {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      className={[role ? null : "btn btn-secondary", className].filter(Boolean).join(" ")}
      type="button"
      role={role}
      onClick={logout}
      disabled={loading}
    >
      {loading ? t("submitting") : t("submit")}
    </button>
  );
}
