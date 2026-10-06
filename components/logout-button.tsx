"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

type LogoutButtonProps = {
  className?: string;
};

export function LogoutButton({ className }: LogoutButtonProps) {
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
      className={["btn", "btn-secondary", className].filter(Boolean).join(" ")}
      type="button"
      onClick={logout}
      disabled={loading}
    >
      {loading ? t("submitting") : t("submit")}
    </button>
  );
}
