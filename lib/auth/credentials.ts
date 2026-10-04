import { ColorVisionMode, FontScaleMode, Prisma, ThemeMode, UserRole, UserStatus } from "@/lib/generated/prisma/client";
import { getAuthPassword, getAuthUsername } from "@/lib/auth/config";
import { getManySettingValues } from "@/lib/integrations/app-settings";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/security/password";

const LEGACY_KEYS = {
  username: "APP_AUTH_USERNAME",
  passwordHash: "APP_AUTH_PASSWORD_HASH",
} as const;

const USERNAME_PATTERN = /^[a-z0-9._-]+$/;
const ROOT_ADMIN_USERNAME = "admin";

const AUTH_USER_SELECT = {
  id: true,
  username: true,
  role: true,
  status: true,
  is_root_admin: true,
  theme_mode: true,
  font_scale_mode: true,
  color_vision_mode: true,
} satisfies Prisma.UserSelect;

type AuthUserRow = {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  is_root_admin: boolean;
  theme_mode: ThemeMode;
  font_scale_mode: FontScaleMode;
  color_vision_mode: ColorVisionMode;
};

export type AuthUser = {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  isRootAdmin: boolean;
  themeMode: ThemeMode;
  fontScaleMode: FontScaleMode;
  colorVisionMode: ColorVisionMode;
};

export type AuthConfigSnapshot = {
  username: string;
  role: UserRole;
  status: UserStatus;
  isRootAdmin: boolean;
};

export type LoginFailureReason = "INVALID_CREDENTIALS" | "SUSPENDED";
export type VerifyLoginResult = {
  user: AuthUser | null;
  reason?: LoginFailureReason;
};

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

function mapAuthUser(row: AuthUserRow): AuthUser {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    status: row.status,
    isRootAdmin: row.is_root_admin,
    themeMode: row.theme_mode,
    fontScaleMode: row.font_scale_mode,
    colorVisionMode: row.color_vision_mode,
  };
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
  await prisma.project.updateMany({
    where: { owner_user_id: null },
    data: { owner_user_id: userId },
  });
}

async function ensureRootAdminExists() {
  const existingRoot = await prisma.user.findFirst({ where: { is_root_admin: true }, select: { id: true } });
  if (existingRoot) {
    return;
  }

  const byUsername = await prisma.user.findUnique({
    where: { username: ROOT_ADMIN_USERNAME },
    select: { id: true },
  });

  const fallback =
    byUsername ??
    (await prisma.user.findFirst({
      orderBy: { created_at: "asc" },
      select: { id: true },
    }));

  if (!fallback) {
    return;
  }

  await prisma.user.update({
    where: { id: fallback.id },
    data: {
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      is_root_admin: true,
    },
  });
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
  const firstUser = await prisma.user.findFirst({
    orderBy: { created_at: "asc" },
    select: AUTH_USER_SELECT,
  });

  if (firstUser) {
    await ensureRootAdminExists();
    const resolved = await prisma.user.findUnique({ where: { id: firstUser.id }, select: AUTH_USER_SELECT });
    if (!resolved) {
      throw new Error("Utente non trovato");
    }

    return mapAuthUser(resolved as AuthUserRow);
  }

  const legacy = await getLegacyAuthValues();
  const fallbackUsername = normalizeUsername(getAuthUsername()) || ROOT_ADMIN_USERNAME;
  const username = legacy?.username || fallbackUsername;
  const passwordHash = legacy?.passwordHash || hashPassword(getAuthPassword());

  try {
    const created = await prisma.user.create({
      data: {
        username,
        password_hash: passwordHash,
        role: UserRole.SUBSCRIBER,
        status: UserStatus.ACTIVE,
        is_root_admin: false,
        theme_mode: ThemeMode.DARK,
        font_scale_mode: FontScaleMode.NORMAL,
        color_vision_mode: ColorVisionMode.NONE,
      },
      select: AUTH_USER_SELECT,
    });

    await assignOrphanDataToUser(created.id);
    await ensureRootAdminExists();

    const resolved = await prisma.user.findUnique({ where: { id: created.id }, select: AUTH_USER_SELECT });
    if (!resolved) {
      throw new Error("Utente non trovato");
    }

    return mapAuthUser(resolved as AuthUserRow);
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const existing = await prisma.user.findUnique({
      where: { username },
      select: AUTH_USER_SELECT,
    });

    if (!existing) {
      throw error;
    }

    await ensureRootAdminExists();
    const resolved = await prisma.user.findUnique({ where: { id: existing.id }, select: AUTH_USER_SELECT });
    if (!resolved) {
      throw new Error("Utente non trovato");
    }

    return mapAuthUser(resolved as AuthUserRow);
  }
}

export async function findAuthUserById(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: AUTH_USER_SELECT,
  });

  return user ? mapAuthUser(user as AuthUserRow) : null;
}

export async function getAuthConfigSnapshot(userId: string): Promise<AuthConfigSnapshot> {
  const user = await findAuthUserById(userId);
  if (!user) {
    throw new Error("Utente non trovato");
  }

  return {
    username: user.username,
    role: user.role,
    status: user.status,
    isRootAdmin: user.isRootAdmin,
  };
}

export async function verifyLoginCredentials(username: string, password: string): Promise<VerifyLoginResult> {
  await ensureLegacyDefaultUser();

  const normalized = normalizeUsername(username);
  if (!normalized || !password) {
    return { user: null, reason: "INVALID_CREDENTIALS" };
  }

  const user = await prisma.user.findUnique({
    where: { username: normalized },
    select: {
      id: true,
      username: true,
      role: true,
      status: true,
      is_root_admin: true,
      theme_mode: true,
      font_scale_mode: true,
      color_vision_mode: true,
      password_hash: true,
    },
  });

  if (!user) {
    return { user: null, reason: "INVALID_CREDENTIALS" };
  }

  if (!verifyPassword(password, user.password_hash)) {
    return { user: null, reason: "INVALID_CREDENTIALS" };
  }

  if (user.status === UserStatus.SUSPENDED) {
    return { user: null, reason: "SUSPENDED" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { last_login_at: new Date() },
  });

  return {
    user: mapAuthUser(user as AuthUserRow),
  };
}

export async function registerUser(input: {
  username: string;
  password: string;
  role?: UserRole;
}): Promise<AuthUser> {
  await ensureLegacyDefaultUser();

  const username = validateUsername(input.username);
  const password = validatePassword(input.password);
  const role = input.role ?? UserRole.SUBSCRIBER;

  try {
    const created = await prisma.user.create({
      data: {
        username,
        password_hash: hashPassword(password),
        role,
        status: UserStatus.ACTIVE,
        is_root_admin: false,
        theme_mode: ThemeMode.DARK,
        font_scale_mode: FontScaleMode.NORMAL,
        color_vision_mode: ColorVisionMode.NONE,
      },
      select: AUTH_USER_SELECT,
    });

    return mapAuthUser(created as AuthUserRow);
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
}): Promise<AuthUser> {
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
      select: AUTH_USER_SELECT,
    });

    return mapAuthUser(updated as AuthUserRow);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("Username gia in uso");
    }

    throw error;
  }
}

export async function updateUserAdminFields(input: {
  targetUserId: string;
  role?: UserRole;
  status?: UserStatus;
  password?: string;
  isRootAdmin?: boolean;
}): Promise<AuthUser> {
  const data: {
    role?: UserRole;
    status?: UserStatus;
    password_hash?: string;
    is_root_admin?: boolean;
  } = {};

  if (input.role) {
    data.role = input.role;
  }

  if (input.status) {
    data.status = input.status;
  }

  if (typeof input.password === "string" && input.password.length > 0) {
    data.password_hash = hashPassword(validatePassword(input.password));
  }

  if (typeof input.isRootAdmin === "boolean") {
    data.is_root_admin = input.isRootAdmin;
  }

  if (!data.role && !data.status && !data.password_hash && data.is_root_admin === undefined) {
    throw new Error("Nessuna modifica da salvare");
  }

  const updated = await prisma.user.update({
    where: { id: input.targetUserId },
    data,
    select: AUTH_USER_SELECT,
  });

  return mapAuthUser(updated as AuthUserRow);
}