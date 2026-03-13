import { Prisma } from "@prisma/client";
import { getAuthPassword, getAuthUsername } from "@/lib/auth/config";
import { getManySettingValues } from "@/lib/integrations/app-settings";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/security/password";

const LEGACY_KEYS = {
  username: "APP_AUTH_USERNAME",
  passwordHash: "APP_AUTH_PASSWORD_HASH",
} as const;

const USERNAME_PATTERN = /^[a-z0-9._-]+$/;

export type AuthUser = {
  id: string;
  username: string;
};

export type AuthConfigSnapshot = {
  username: string;
};

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

async function getLegacyAuthValues() {
  const values = await getManySettingValues(Object.values(LEGACY_KEYS));
  const username = normalizeUsername(String(values[LEGACY_KEYS.username] ?? ""));
  const passwordHash = String(values[LEGACY_KEYS.passwordHash] ?? "").trim();

  if (!username || !passwordHash) {
    return null;
  }

  return { username, passwordHash };
}

async function assignOrphanDataToUser(userId: string) {
  await prisma.$transaction([
    prisma.project.updateMany({
      where: { owner_user_id: null },
      data: { owner_user_id: userId },
    }),
    prisma.googleAdsCredential.updateMany({
      where: { user_id: null },
      data: { user_id: userId },
    }),
  ]);
}

export function validateUsername(input: string): string {
  const username = normalizeUsername(input);

  if (username.length < 3 || username.length > 40) {
    throw new Error("Username non valido: usa da 3 a 40 caratteri");
  }

  if (!USERNAME_PATTERN.test(username)) {
    throw new Error("Username non valido: usa solo lettere minuscole, numeri, punto, underscore o trattino");
  }

  return username;
}

export function validatePassword(input: string): string {
  const password = String(input ?? "");

  if (password.length < 8) {
    throw new Error("Password troppo corta: minimo 8 caratteri");
  }

  return password;
}

export async function ensureLegacyDefaultUser(): Promise<AuthUser> {
  const firstUser = await prisma.user.findFirst({ orderBy: { created_at: "asc" } });
  if (firstUser) {
    return { id: firstUser.id, username: firstUser.username };
  }

  const legacy = await getLegacyAuthValues();
  const fallbackUsername = normalizeUsername(getAuthUsername()) || "admin";
  const username = legacy?.username || fallbackUsername;
  const passwordHash = legacy?.passwordHash || hashPassword(getAuthPassword());

  try {
    const created = await prisma.user.create({
      data: {
        username,
        password_hash: passwordHash,
      },
      select: {
        id: true,
        username: true,
      },
    });

    await assignOrphanDataToUser(created.id);
    return created;
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const existing = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true },
    });

    if (!existing) {
      throw error;
    }

    return existing;
  }
}

export async function findAuthUserById(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
    },
  });

  return user;
}

export async function getAuthConfigSnapshot(userId: string): Promise<AuthConfigSnapshot> {
  const user = await findAuthUserById(userId);
  if (!user) {
    throw new Error("Utente non trovato");
  }

  return {
    username: user.username,
  };
}

export async function verifyLoginCredentials(username: string, password: string): Promise<AuthUser | null> {
  await ensureLegacyDefaultUser();

  const normalized = normalizeUsername(username);
  if (!normalized || !password) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { username: normalized },
    select: {
      id: true,
      username: true,
      password_hash: true,
    },
  });

  if (!user) {
    return null;
  }

  if (!verifyPassword(password, user.password_hash)) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
  };
}

export async function registerUser(input: { username: string; password: string }): Promise<AuthUser> {
  await ensureLegacyDefaultUser();

  const username = validateUsername(input.username);
  const password = validatePassword(input.password);

  try {
    return await prisma.user.create({
      data: {
        username,
        password_hash: hashPassword(password),
      },
      select: {
        id: true,
        username: true,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("Username gia in uso");
    }

    throw error;
  }
}

export async function verifyUserPassword(userId: string, password: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password_hash: true },
  });

  if (!user) {
    return false;
  }

  return verifyPassword(password, user.password_hash);
}

export async function updateAuthCredentials(input: {
  userId: string;
  username?: string;
  password?: string;
}): Promise<AuthConfigSnapshot> {
  const data: { username?: string; password_hash?: string } = {};

  if (typeof input.username === "string" && input.username.trim()) {
    data.username = validateUsername(input.username);
  }

  if (typeof input.password === "string" && input.password.length > 0) {
    data.password_hash = hashPassword(validatePassword(input.password));
  }

  if (!data.username && !data.password_hash) {
    throw new Error("Nessuna modifica da salvare");
  }

  try {
    const updated = await prisma.user.update({
      where: { id: input.userId },
      data,
      select: { username: true },
    });

    return { username: updated.username };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("Username gia in uso");
    }

    throw error;
  }
}
