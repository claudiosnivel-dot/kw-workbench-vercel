import { getAuthPassword, getAuthUsername } from "@/lib/auth/config";
import { getManySettingValues, upsertSettingValue } from "@/lib/integrations/app-settings";
import { hashPassword, verifyPassword } from "@/lib/security/password";

const KEYS = {
  username: "APP_AUTH_USERNAME",
  passwordHash: "APP_AUTH_PASSWORD_HASH",
} as const;

export type AuthConfigSnapshot = {
  username: string;
  source: "env" | "db";
  hasPasswordOverride: boolean;
};

async function getStoredAuthValues() {
  const values = await getManySettingValues(Object.values(KEYS));
  const username = values[KEYS.username]?.trim();
  const passwordHash = values[KEYS.passwordHash]?.trim();

  if (!username || !passwordHash) {
    return null;
  }

  return { username, passwordHash };
}

export async function getAuthConfigSnapshot(): Promise<AuthConfigSnapshot> {
  const stored = await getStoredAuthValues();

  if (stored) {
    return {
      username: stored.username,
      source: "db",
      hasPasswordOverride: true,
    };
  }

  return {
    username: getAuthUsername(),
    source: "env",
    hasPasswordOverride: false,
  };
}

export async function verifyLoginCredentials(username: string, password: string): Promise<boolean> {
  const stored = await getStoredAuthValues();

  if (stored) {
    if (username !== stored.username) {
      return false;
    }
    return verifyPassword(password, stored.passwordHash);
  }

  return username === getAuthUsername() && password === getAuthPassword();
}

export async function updateAuthCredentials(input: {
  username?: string;
  password?: string;
}) {
  const writes: Promise<unknown>[] = [];

  if (typeof input.username === "string" && input.username.trim()) {
    writes.push(
      upsertSettingValue({
        key: KEYS.username,
        value: input.username.trim(),
        isSecret: false,
      })
    );
  }

  if (typeof input.password === "string" && input.password.length >= 4) {
    writes.push(
      upsertSettingValue({
        key: KEYS.passwordHash,
        value: hashPassword(input.password),
        isSecret: true,
      })
    );
  }

  await Promise.all(writes);
  return getAuthConfigSnapshot();
}
