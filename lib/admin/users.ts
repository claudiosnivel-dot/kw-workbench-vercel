import { Prisma, UserRole, UserStatus } from "@/lib/generated/prisma/client";
import { type AuthUser, registerUser, updateUserAdminFields, validatePassword, validateUsername } from "@/lib/auth/credentials";
import { AppError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";

/** Errore delle azioni admin: status e code espliciti, messaggio pubblico (T-503). */
export class AdminActionError extends AppError {
  constructor(message: string, status: number, code: string) {
    super(status, code, message);
    this.name = "AdminActionError";
  }
}

/** Ruolo da query o body (case-insensitive); undefined se assente o sconosciuto. */
export function parseUserRole(value: string | null): UserRole | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();
  if (normalized === UserRole.ADMIN) return UserRole.ADMIN;
  if (normalized === UserRole.SUBSCRIBER) return UserRole.SUBSCRIBER;
  return undefined;
}

/** Stato da query o body (case-insensitive); undefined se assente o sconosciuto. */
export function parseUserStatus(value: string | null): UserStatus | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();
  if (normalized === UserStatus.ACTIVE) return UserStatus.ACTIVE;
  if (normalized === UserStatus.SUSPENDED) return UserStatus.SUSPENDED;
  return undefined;
}

export type AdminUserRecord = {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  isRootAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

export type AdminUsersTotals = {
  totalUsers: number;
  /** null per l'admin non root: gli admin sono fuori dal suo perimetro (CWE-200). */
  totalAdmins: number | null;
  totalSubscribers: number;
  totalActive: number;
  totalSuspended: number;
};

type AdminUserRow = {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  is_root_admin: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
};

function toAdminUserRecord(row: AdminUserRow): AdminUserRecord {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    status: row.status,
    isRootAdmin: row.is_root_admin,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    lastLoginAt: row.last_login_at ? row.last_login_at.toISOString() : null,
  };
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_TEXT_LENGTH = 100;
const SELF_ACTION_MESSAGE = "Non puoi modificare o eliminare il tuo account dalla gestione utenti.";

function positiveInt(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value as number) >= 1 ? Math.floor(value as number) : fallback;
}

function getManagedRoleScope(actor: AuthUser): UserRole | undefined {
  if (actor.isRootAdmin) {
    return undefined;
  }

  return UserRole.SUBSCRIBER;
}

type AdminUsersListRow = { [K in keyof AdminUserRow]: AdminUserRow[K] | null } & {
  total_users: number;
  total_admins: number;
  total_subscribers: number;
  total_active: number;
  total_suspended: number;
  filtered_total: number;
};

// SQL statico della lista utenti (T-1105): totali del perimetro, totale filtrato e pagina in una sola query.
// I valori (perimetro, filtri, LIMIT, OFFSET) entrano solo come parametri legati, composti in listAdminUsers.
const LIST_TOTALS = Prisma.sql`
  SELECT "t"."total_users", "t"."total_admins", "t"."total_subscribers", "t"."total_active", "t"."total_suspended",
    "t"."filtered_total", "p"."id", "p"."username", "p"."role", "p"."status", "p"."is_root_admin", "p"."created_at",
    "p"."updated_at", "p"."last_login_at"
  FROM (
    SELECT count(*)::int AS "total_users",
      count(*) FILTER (WHERE "role" = 'ADMIN')::int AS "total_admins",
      count(*) FILTER (WHERE "role" = 'SUBSCRIBER')::int AS "total_subscribers",
      count(*) FILTER (WHERE "status" = 'ACTIVE')::int AS "total_active",
      count(*) FILTER (WHERE "status" = 'SUSPENDED')::int AS "total_suspended",
      count(*) FILTER (WHERE`;
const LIST_TOTALS_SCOPE = Prisma.sql`)::int AS "filtered_total" FROM "users" WHERE`;
const LIST_PAGE = Prisma.sql`) AS "t" LEFT JOIN LATERAL (
    SELECT "id", "username", "role", "status", "is_root_admin", "created_at", "updated_at", "last_login_at"
    FROM "users" WHERE`;
// id come ultimo criterio: ordinamento totale, nessun utente ripetuto o saltato fra le pagine.
const LIST_PAGE_ORDER = Prisma.sql`ORDER BY "is_root_admin" DESC, "created_at" DESC, "id" DESC`;
const LIST_TAIL = Prisma.sql`) AS "p" ON true
  ORDER BY "p"."is_root_admin" DESC NULLS LAST, "p"."created_at" DESC, "p"."id" DESC`;
const AND = Prisma.sql`AND`;
const ALL_ROWS = Prisma.sql`TRUE`;

/** LIKE con %, _ e \ dell'utente presi alla lettera. */
function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, "\\$&")}%`;
}

/** Perimetro gestibile (per l'admin non root solo i sottoscrittori) e filtri della lista, come condizioni SQL. */
function listConditions(actor: AuthUser, input: { searchText?: string; role?: UserRole; status?: UserStatus }) {
  const filters: Prisma.Sql[] = [];

  const searchText = String(input.searchText ?? "").trim().slice(0, MAX_SEARCH_TEXT_LENGTH);
  if (searchText) {
    filters.push(Prisma.sql`"username" ILIKE ${containsPattern(searchText)}`);
  }

  const managedRoleScope = getManagedRoleScope(actor);
  if (!managedRoleScope && input.role) {
    filters.push(Prisma.sql`"role" = ${input.role}::"UserRole"`);
  }

  if (input.status) {
    filters.push(Prisma.sql`"status" = ${input.status}::"UserStatus"`);
  }

  return {
    scope: managedRoleScope ? Prisma.sql`"role" = ${managedRoleScope}::"UserRole"` : ALL_ROWS,
    filters: filters.length > 0 ? Prisma.join(filters, " AND ") : ALL_ROWS,
  };
}

function assertCanManageTarget(actor: AuthUser, target: {
  id: string;
  role: UserRole;
  is_root_admin: boolean;
}) {
  if (target.is_root_admin) {
    throw new AdminActionError("Il root admin non può essere modificato", 403, "FORBIDDEN");
  }

  if (!actor.isRootAdmin && target.role === UserRole.ADMIN) {
    throw new AdminActionError("Operazione non consentita su un utente admin", 403, "FORBIDDEN");
  }
}

/** Bersaglio di un'azione admin: mai se stessi (400), deve esistere (404) ed essere nel perimetro (403). */
async function findManageableTarget(actor: AuthUser, targetUserId: string) {
  if (actor.id === targetUserId) {
    throw new AdminActionError(SELF_ACTION_MESSAGE, 400, "SELF_ACTION_FORBIDDEN");
  }

  const target = await findTargetUser(targetUserId);
  if (!target) {
    throw new AdminActionError("Utente non trovato", 404, "NOT_FOUND");
  }

  assertCanManageTarget(actor, target);
  return target;
}

async function findTargetUser(targetUserId: string) {
  return prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      username: true,
      role: true,
      status: true,
      is_root_admin: true,
      created_at: true,
      updated_at: true,
      last_login_at: true,
    },
  });
}

export async function listAdminUsers(
  actor: AuthUser,
  input: {
    searchText?: string;
    role?: UserRole;
    status?: UserStatus;
    page?: number;
    pageSize?: number;
  }
): Promise<{ users: AdminUserRecord[]; totals: AdminUsersTotals; page: number; pageSize: number; total: number }> {
  const page = positiveInt(input.page, 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, positiveInt(input.pageSize, DEFAULT_PAGE_SIZE));
  const { scope, filters } = listConditions(actor, input);

  // Una sola query: con una pagina oltre l'ultima la riga dei totali arriva con le colonne dell'utente a null.
  const rows = await prisma.$queryRaw<AdminUsersListRow[]>(
    Prisma.join(
      [
        LIST_TOTALS,
        filters,
        LIST_TOTALS_SCOPE,
        scope,
        LIST_PAGE,
        scope,
        AND,
        filters,
        LIST_PAGE_ORDER,
        Prisma.sql`LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
        LIST_TAIL,
      ],
      " "
    )
  );
  const [first] = rows;

  return {
    users: rows.filter((row) => row.id !== null).map((row) => toAdminUserRecord(row as AdminUserRow)),
    totals: {
      totalUsers: first.total_users,
      // Totali nel perimetro gestibile: l'admin non root non vede il numero degli admin (CWE-200).
      totalAdmins: actor.isRootAdmin ? first.total_admins : null,
      totalSubscribers: first.total_subscribers,
      totalActive: first.total_active,
      totalSuspended: first.total_suspended,
    },
    page,
    pageSize,
    total: first.filtered_total,
  };
}

export async function createUserFromAdmin(
  actor: AuthUser,
  input: {
    username: string;
    password: string;
    role?: UserRole;
  }
): Promise<AdminUserRecord> {
  const role = input.role ?? UserRole.SUBSCRIBER;
  if (role === UserRole.ADMIN && !actor.isRootAdmin) {
    throw new AdminActionError("Solo il root admin può creare altri admin", 403, "FORBIDDEN");
  }

  const username = validateUsername(input.username);
  const password = validatePassword(input.password);

  const created = await registerUser({ username, password, role });
  const row = await findTargetUser(created.id);

  if (!row) {
    throw new AdminActionError("Utente creato ma non trovato", 500, "INTERNAL_ERROR");
  }

  return toAdminUserRecord(row as AdminUserRow);
}

export async function updateUserFromAdmin(
  actor: AuthUser,
  input: {
    targetUserId: string;
    role?: UserRole;
    status?: UserStatus;
    newPassword?: string;
  }
): Promise<AdminUserRecord> {
  const target = await findManageableTarget(actor, input.targetUserId);

  if (input.role === UserRole.ADMIN && !actor.isRootAdmin) {
    throw new AdminActionError("Solo il root admin può promuovere ad admin", 403, "FORBIDDEN");
  }

  const updatePayload: {
    role?: UserRole;
    status?: UserStatus;
    password?: string;
  } = {};

  if (input.role) {
    updatePayload.role = input.role;
  }

  if (input.status) {
    updatePayload.status = input.status;
  }

  if (typeof input.newPassword === "string" && input.newPassword.length > 0) {
    updatePayload.password = validatePassword(input.newPassword);
  }

  if (!updatePayload.role && !updatePayload.status && !updatePayload.password) {
    throw new AdminActionError("Nessuna modifica da salvare", 400, "VALIDATION_ERROR");
  }

  const updated = await updateUserAdminFields({
    targetUserId: target.id,
    role: updatePayload.role,
    status: updatePayload.status,
    password: updatePayload.password,
  });

  const row = await findTargetUser(updated.id);
  if (!row) {
    throw new AdminActionError("Utente aggiornato ma non trovato", 500, "INTERNAL_ERROR");
  }

  return toAdminUserRecord(row as AdminUserRow);
}

export async function deleteUserFromAdmin(actor: AuthUser, targetUserId: string): Promise<void> {
  const target = await findManageableTarget(actor, targetUserId);
  await prisma.user.delete({ where: { id: target.id } });
}