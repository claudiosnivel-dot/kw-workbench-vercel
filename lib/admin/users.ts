import { Prisma, UserRole, UserStatus } from "@prisma/client";
import { type AuthUser, registerUser, updateUserAdminFields, validatePassword, validateUsername } from "@/lib/auth/credentials";
import { prisma } from "@/lib/prisma";

export class AdminActionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AdminActionError";
    this.status = status;
  }
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
  totalAdmins: number;
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

function getManagedRoleScope(actor: AuthUser): UserRole | undefined {
  if (actor.isRootAdmin) {
    return undefined;
  }

  return UserRole.SUBSCRIBER;
}

function buildListWhere(actor: AuthUser, input: {
  searchText?: string;
  role?: UserRole;
  status?: UserStatus;
}): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {};

  const searchText = String(input.searchText ?? "").trim();
  if (searchText) {
    where.username = {
      contains: searchText,
      mode: "insensitive",
    };
  }

  const managedRoleScope = getManagedRoleScope(actor);
  if (managedRoleScope) {
    where.role = managedRoleScope;
  } else if (input.role) {
    where.role = input.role;
  }

  if (input.status) {
    where.status = input.status;
  }

  return where;
}

function assertCanManageTarget(actor: AuthUser, target: {
  id: string;
  role: UserRole;
  is_root_admin: boolean;
}) {
  if (target.is_root_admin) {
    throw new AdminActionError("Il root admin non puo essere modificato", 403);
  }

  if (!actor.isRootAdmin && target.role === UserRole.ADMIN) {
    throw new AdminActionError("Operazione non consentita su un utente admin", 403);
  }
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
  }
): Promise<{ users: AdminUserRecord[]; totals: AdminUsersTotals }> {
  const where = buildListWhere(actor, input);

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ is_root_admin: "desc" }, { created_at: "desc" }],
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
    take: 500,
  });

  const baseWhere: Prisma.UserWhereInput = getManagedRoleScope(actor)
    ? { role: UserRole.SUBSCRIBER }
    : {};

  const [totalUsers, totalAdmins, totalSubscribers, totalActive, totalSuspended] = await Promise.all([
    prisma.user.count({ where: baseWhere }),
    prisma.user.count({
      where: {
        ...baseWhere,
        role: UserRole.ADMIN,
      },
    }),
    prisma.user.count({
      where: {
        ...baseWhere,
        role: UserRole.SUBSCRIBER,
      },
    }),
    prisma.user.count({
      where: {
        ...baseWhere,
        status: UserStatus.ACTIVE,
      },
    }),
    prisma.user.count({
      where: {
        ...baseWhere,
        status: UserStatus.SUSPENDED,
      },
    }),
  ]);

  return {
    users: users.map((row) => toAdminUserRecord(row as AdminUserRow)),
    totals: {
      totalUsers,
      totalAdmins,
      totalSubscribers,
      totalActive,
      totalSuspended,
    },
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
    throw new AdminActionError("Solo il root admin puo creare altri admin", 403);
  }

  const username = validateUsername(input.username);
  const password = validatePassword(input.password);

  const created = await registerUser({ username, password, role });
  const row = await findTargetUser(created.id);

  if (!row) {
    throw new AdminActionError("Utente creato ma non trovato", 500);
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
  const target = await findTargetUser(input.targetUserId);
  if (!target) {
    throw new AdminActionError("Utente non trovato", 404);
  }

  assertCanManageTarget(actor, target);

  if (input.role === UserRole.ADMIN && !actor.isRootAdmin) {
    throw new AdminActionError("Solo il root admin puo promuovere ad admin", 403);
  }

  if (actor.id === target.id) {
    if (input.status === UserStatus.SUSPENDED) {
      throw new AdminActionError("Non puoi sospendere il tuo account", 400);
    }

    if (input.role && input.role !== UserRole.ADMIN) {
      throw new AdminActionError("Non puoi rimuovere il tuo ruolo admin", 400);
    }
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
    throw new AdminActionError("Nessuna modifica da salvare", 400);
  }

  const updated = await updateUserAdminFields({
    targetUserId: target.id,
    role: updatePayload.role,
    status: updatePayload.status,
    password: updatePayload.password,
  });

  const row = await findTargetUser(updated.id);
  if (!row) {
    throw new AdminActionError("Utente aggiornato ma non trovato", 500);
  }

  return toAdminUserRecord(row as AdminUserRow);
}

export async function deleteUserFromAdmin(actor: AuthUser, targetUserId: string): Promise<void> {
  const target = await findTargetUser(targetUserId);
  if (!target) {
    throw new AdminActionError("Utente non trovato", 404);
  }

  assertCanManageTarget(actor, target);

  if (actor.id === target.id) {
    throw new AdminActionError("Non puoi eliminare il tuo account", 400);
  }

  await prisma.user.delete({ where: { id: target.id } });
}