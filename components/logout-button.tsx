"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type LogoutButtonProps = {
  className?: string;
};

export function LogoutButton({ className }: LogoutButtonProps) {
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
      className={`${className ?? ""} btn-secondary`}
      type="button"
      onClick={logout}
      disabled={loading}
    >
      {loading ? "Uscita in corso..." : "Esci"}
    </button>
  );
}
