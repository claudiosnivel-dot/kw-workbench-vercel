import { randomBytes } from "node:crypto";
import {
  ColorVisionMode,
  FontScaleMode,
  Prisma,
  ThemeMode,
  UiLocale,
  UserRole,
  UserStatus,
} from "@/lib/generated/prisma/client";
import { getRootAdminEmail } from "@/lib/auth/config";
import { normalizeEmail } from "@/lib/auth/email-address";
import { getAdminEmail } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { AppError, ConflictError, ValidationError } from "@/lib/http/errors";
import { hashPassword, verifyPassword } from "@/lib/security/password";

const MAX_DISPLAY_NAME_LENGTH = 60;
// Caratteri di controllo (CR, LF, tab...): il nome finisce nelle email e nelle pagine admin.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const AUTH_USER_SELECT = {
  id: true,
  email: true,
  display_name: true,
  email_verified_at: true,
  role: true,
  status: true,
  is_root_admin: true,
  theme_mode: true,
  font_scale_mode: true,
  color_vision_mode: true,
  // Lingua dell'interfaccia (T-1301): arriva con la stessa query che risolve la sessione.
  ui_locale: true,
  session_version: true,
  // Versione dei termini accettata (T-1405): il gate delle pagine la confronta con LEGAL_TERMS_VERSION.
  accepted_terms_version: true,
} satisfies Prisma.UserSelect;

type AuthUserRow = Prisma.UserGetPayload<{ select: typeof AUTH_USER_SELECT }>;

export type AuthUser = {
  id: string;
  /** null solo per gli utenti legacy (T-1401), che non possono accedere con email e password. */
  email: string | null;
  displayName: string;
  emailVerified: boolean;
  role: UserRole;
  status: UserStatus;
  isRootAdmin: boolean;
  themeMode: ThemeMode;
  fontScaleMode: FontScaleMode;
  colorVisionMode: ColorVisionMode;
  uiLocale: UiLocale | null;
  sessionVersion: number;
  acceptedTermsVersion: string | null;
};

export type LoginFailureReason = "INVALID_CREDENTIALS" | "SUSPENDED";
export type VerifyLoginResult = {
  user: AuthUser | null;
  reason?: LoginFailureReason;
};

/** Email già registrata (409): la creazione utente dell'admin la mostra, la registrazione pubblica no (T-1403). */
export class EmailTakenError extends ConflictError {
  /** Email normalizzata già registrata: serve all'avviso account-exists, mai al corpo della risposta. */
  readonly email: string;

  constructor(email: string) {
    super("Email già registrata", "EMAIL_TAKEN");
    this.name = "EmailTakenError";
    this.email = email;
  }
}

let dummyPasswordHash: Promise<string> | null = null;

/** Hash fittizio calcolato una sola volta per processo, verificato quando l'email non esiste. */
function getDummyPasswordHash(): Promise<string> {
  dummyPasswordHash ??= hashPassword(randomBytes(32).toString("hex"));
  return dummyPasswordHash;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function mapAuthUser(row: AuthUserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    emailVerified: row.email_verified_at !== null,
    role: row.role,
    status: row.status,
    isRootAdmin: row.is_root_admin,
    themeMode: row.theme_mode,
    fontScaleMode: row.font_scale_mode,
    colorVisionMode: row.color_vision_mode,
    uiLocale: row.ui_locale,
    sessionVersion: row.session_version,
    acceptedTermsVersion: row.accepted_terms_version,
  };
}

async function assignOrphanDataToUser(userId: string) {
  await prisma.project.updateMany({
    where: { owner_user_id: null },
    data: { owner_user_id: userId },
  });
}

/**
 * Senza root admin promuove l'utente di APP_ADMIN_EMAIL (T-1401), solo se la sua email è verificata: chi registra
 * per primo quell'indirizzo senza possederlo non diventa root admin. Mai più il nome 'admin' o il primo utente.
 */
async function ensureRootAdminExists() {
  const existingRoot = await prisma.user.findFirst({ where: { is_root_admin: true }, select: { id: true } });
  const adminEmail = getAdminEmail();
  if (existingRoot || !adminEmail) {
    return;
  }

  await prisma.user.updateMany({
    where: { email: adminEmail, email_verified_at: { not: null } },
    data: { role: UserRole.ADMIN, status: UserStatus.ACTIVE, is_root_admin: true },
  });
}

/** Email normalizzata o 400 EMAIL_INVALID (T-1401). */
export function requireEmail(input: unknown): string {
  const email = normalizeEmail(input);
  if (!email) {
    throw new AppError(400, "EMAIL_INVALID", "Email non valida");
  }
  return email;
}

/** Nome mostrato (T-1401): da 1 a 60 caratteri senza spazi ai bordi, nessun carattere di controllo. */
export function validateDisplayName(input: string): string {
  const displayName = String(input ?? "").trim();

  if (displayName.length < 1 || displayName.length > MAX_DISPLAY_NAME_LENGTH || CONTROL_CHARACTERS.test(displayName)) {
    throw new ValidationError(`Nome non valido: usa da 1 a ${MAX_DISPLAY_NAME_LENGTH} caratteri`);
  }

  return displayName;
}

export function validatePassword(input: string): string {
  const password = String(input ?? "");

  if (password.length < 8) {
    throw new ValidationError("Password troppo corta: minimo 8 caratteri");
  }

  return password;
}

/** Hash della nuova password validata, o undefined se la password non va cambiata. */
async function hashNewPassword(password: string | undefined): Promise<string | undefined> {
  if (typeof password !== "string" || password.length === 0) {
    return undefined;
  }

  return hashPassword(validatePassword(password));
}

/** Parte locale dell'email come nome mostrato di default, nei limiti di validateDisplayName. */
function defaultDisplayName(email: string): string {
  return email.slice(0, email.lastIndexOf("@")).slice(0, MAX_DISPLAY_NAME_LENGTH);
}

async function findResolvedUser(userId: string): Promise<AuthUser> {
  const resolved = await findAuthUserById(userId);
  if (!resolved) {
    throw new Error("Utente non trovato");
  }
  return resolved;
}

/**
 * Root admin iniziale con la tabella users vuota (T-1401): email APP_ADMIN_EMAIL già verificata, password casuale
 * mai comunicata (il primo accesso passa dal recupero password di T-1404). Nessuna credenziale di default.
 */
async function createRootAdmin(): Promise<AuthUser> {
  const email = getRootAdminEmail();

  try {
    const created = await prisma.user.create({
      data: {
        email,
        email_verified_at: new Date(),
        display_name: defaultDisplayName(email),
        password_hash: await hashPassword(randomBytes(32).toString("hex")),
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        is_root_admin: true,
      },
      select: { id: true },
    });

    await assignOrphanDataToUser(created.id);
    return findResolvedUser(created.id);
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    // Bootstrap concorrente: l'altra richiesta ha già creato il root admin.
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!existing) {
      throw error;
    }
    return findResolvedUser(existing.id);
  }
}

export async function ensureLegacyDefaultUser(): Promise<AuthUser> {
  const firstUser = await prisma.user.findFirst({
    orderBy: { created_at: "asc" },
    select: { id: true },
  });

  if (!firstUser) {
    return createRootAdmin();
  }

  await ensureRootAdminExists();
  return findResolvedUser(firstUser.id);
}

/**
 * Bootstrap del root admin (T-1401) solo con la tabella users vuota: con utenti presenti login e registrazione
 * eseguono una sola count e nessuna lettura di app_settings (T-1105).
 */
async function bootstrapFirstUserIfEmpty(): Promise<void> {
  if ((await prisma.user.count()) === 0) {
    await ensureLegacyDefaultUser();
  }
}

export async function findAuthUserById(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: AUTH_USER_SELECT,
  });

  return user ? mapAuthUser(user) : null;
}

export async function verifyLoginCredentials(emailInput: string, password: string): Promise<VerifyLoginResult> {
  await bootstrapFirstUserIfEmpty();

  const email = normalizeEmail(emailInput);
  if (!email || !password) {
    return { user: null, reason: "INVALID_CREDENTIALS" };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { ...AUTH_USER_SELECT, password_hash: true },
  });

  if (!user) {
    // Stesso calcolo di una password errata: i tempi di risposta non rivelano quali email esistono.
    await verifyPassword(password, await getDummyPasswordHash());
    return { user: null, reason: "INVALID_CREDENTIALS" };
  }

  if (!(await verifyPassword(password, user.password_hash))) {
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
    user: mapAuthUser(user),
  };
}

/**
 * Nuovo utente con email (T-1401): email normalizzata (400 EMAIL_INVALID), nome mostrato di default uguale alla parte
 * locale dell'email, email non verificata. L'hash della password si calcola prima dell'inserimento anche quando
 * l'email esiste già (EmailTakenError), così il costo non dipende dall'esistenza dell'account. Con
 * acceptedTermsVersion registra la versione dei termini accettata e l'istante (T-1405); uiLocale è la lingua già
 * scelta col selettore prima della registrazione.
 */
export async function registerUser(input: {
  email: string;
  displayName?: string;
  password: string;
  role?: UserRole;
  uiLocale?: UiLocale | null;
  acceptedTermsVersion?: string;
}): Promise<AuthUser> {
  await bootstrapFirstUserIfEmpty();

  const email = requireEmail(input.email);
  const displayName = validateDisplayName(input.displayName?.trim() || defaultDisplayName(email));
  const passwordHash = await hashPassword(validatePassword(input.password));

  try {
    const created = await prisma.user.create({
      data: {
        email,
        display_name: displayName,
        password_hash: passwordHash,
        role: input.role ?? UserRole.SUBSCRIBER,
        status: UserStatus.ACTIVE,
        is_root_admin: false,
        theme_mode: ThemeMode.DARK,
        font_scale_mode: FontScaleMode.NORMAL,
        color_vision_mode: ColorVisionMode.NONE,
        ui_locale: input.uiLocale ?? null,
        ...(input.acceptedTermsVersion
          ? { accepted_terms_version: input.acceptedTermsVersion, accepted_terms_at: new Date() }
          : {}),
      },
      select: AUTH_USER_SELECT,
    });

    return mapAuthUser(created);
  } catch (error) {
    throw isUniqueViolation(error) ? new EmailTakenError(email) : error;
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
  displayName?: string;
  password?: string;
}): Promise<AuthUser> {
  const data: Prisma.UserUpdateInput = {};

  if (typeof input.displayName === "string" && input.displayName.trim()) {
    data.display_name = validateDisplayName(input.displayName);
  }

  const passwordHash = await hashNewPassword(input.password);
  if (passwordHash) {
    data.password_hash = passwordHash;
    // Il cambio password revoca i token già emessi (T-501).
    data.session_version = { increment: 1 };
  }

  if (!data.display_name && !data.password_hash) {
    throw new ValidationError("Nessuna modifica da salvare");
  }

  const updated = await prisma.user.update({
    where: { id: input.userId },
    data,
    select: AUTH_USER_SELECT,
  });

  return mapAuthUser(updated);
}

export async function updateUserAdminFields(input: {
  targetUserId: string;
  role?: UserRole;
  status?: UserStatus;
  password?: string;
}): Promise<AuthUser> {
  const data: Prisma.UserUpdateInput = {};

  if (input.role) {
    data.role = input.role;
  }

  if (input.status) {
    data.status = input.status;
  }

  const passwordHash = await hashNewPassword(input.password);
  if (passwordHash) {
    data.password_hash = passwordHash;
  }

  if (!data.role && !data.status && !data.password_hash) {
    throw new ValidationError("Nessuna modifica da salvare");
  }

  // Password impostata dall'admin o sospensione: i token già emessi non valgono più (T-501).
  if (data.password_hash || data.status === UserStatus.SUSPENDED) {
    data.session_version = { increment: 1 };
  }

  const updated = await prisma.user.update({
    where: { id: input.targetUserId },
    data,
    select: AUTH_USER_SELECT,
  });

  return mapAuthUser(updated);
}

/** «Esci da tutti i dispositivi»: incremento atomico che invalida ogni token emesso finora. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { session_version: { increment: 1 } },
  });
}
