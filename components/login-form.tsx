"use client";

import { FormEvent, useMemo, useState } from "react";
import { ApiErrorPayload, buildApiErrorMessage, readJsonSafe } from "@/lib/client/http";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const safeNextPath = useMemo(() => {
    if (nextPath && nextPath.startsWith("/")) {
      return nextPath;
    }
    return "/";
  }, [nextPath]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password }),
      });

      const payload = await readJsonSafe<ApiErrorPayload>(response);
      if (!response.ok) {
        throw new Error(buildApiErrorMessage(response, payload, "Accesso non riuscito"));
      }

      window.location.assign(safeNextPath);
      return;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Errore imprevisto");
      setLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div>
        <label className="label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          className="input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className="input"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </div>

      <button className="btn-primary w-full" disabled={loading} type="submit">
        {loading ? "Accesso in corso..." : "Accedi"}
      </button>

      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}