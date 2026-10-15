import { UserRole, type UserStatus, type WorkspaceRole } from "@/lib/generated/prisma/client";
import { type AuditLogRow, listUserAuditLog } from "@/lib/admin/audit";
import type { AuthUser } from "@/lib/auth/credentials";
import { usagePeriodStart } from "@/lib/billing/usage";
import { prisma } from "@/lib/prisma";

/** Workspace dell'utente nella sua scheda (T-3401): dei progetti solo il numero, mai nomi o contenuti (T-1705). */
export type AdminUserWorkspace = {
  id: string;
  name: string;
  personal: boolean;
  role: WorkspaceRole;
  projectCount: number;
  /** Contatore keywords_month del mese UTC in corso (T-1703). */
  keywordsThisMonth: number;
};

/** Scheda dell'utente (T-3401); workspaces e audit esistono solo per il root admin. */
export type AdminUserDetail = {
  id: string;
  displayName: string;
  /** null per gli utenti legacy senza email (T-1401). */
  email: string | null;
  emailVerified: boolean;
  role: UserRole;
  status: UserStatus;
  isRootAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  acceptedTermsVersion: string | null;
  acceptedTermsAt: string | null;
  workspaces?: AdminUserWorkspace[];
  audit?: AuditLogRow[];
};

/** Ultime righe del registro nella scheda. */
const USER_AUDIT_ROWS = 20;

async function listUserWorkspaces(userId: string): Promise<AdminUserWorkspace[]> {
  const memberships = await prisma.membership.findMany({
    where: { user_id: userId },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: {
      role: true,
      workspace: {
        select: {
          id: true,
          name: true,
          personal_for_user_id: true,
          _count: { select: { projects: true } },
          usage_counters: {
            where: { metric: "keywords_month", period_start: usagePeriodStart("keywords_month", new Date()) },
            select: { count: true },
          },
        },
      },
    },
  });

  return memberships.map(({ role, workspace }) => ({
    id: workspace.id,
    name: workspace.name,
    personal: workspace.personal_for_user_id !== null,
    role,
    projectCount: workspace._count.projects,
    keywordsThisMonth: workspace.usage_counters[0]?.count ?? 0,
  }));
}

/**
 * Scheda dell'utente per l'admin (T-3401), con le regole di visibilità dell'elenco (T-507): l'admin non root vede solo i
 * sottoscrittori e per gli altri riceve null, come per un utente che non esiste (CWE-639). Workspace e registro solo per
 * il root admin.
 */
export async function getAdminUserDetail(actor: AuthUser, targetUserId: string): Promise<AdminUserDetail | null> {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      display_name: true,
      email: true,
      email_verified_at: true,
      role: true,
      status: true,
      is_root_admin: true,
      created_at: true,
      last_login_at: true,
      accepted_terms_version: true,
      accepted_terms_at: true,
    },
  });
  if (!user || (!actor.isRootAdmin && user.role !== UserRole.SUBSCRIBER)) {
    return null;
  }

  const detail: AdminUserDetail = {
    id: user.id,
    displayName: user.display_name,
    email: user.email,
    emailVerified: user.email_verified_at !== null,
    role: user.role,
    status: user.status,
    isRootAdmin: user.is_root_admin,
    createdAt: user.created_at.toISOString(),
    lastLoginAt: user.last_login_at?.toISOString() ?? null,
    acceptedTermsVersion: user.accepted_terms_version,
    acceptedTermsAt: user.accepted_terms_at?.toISOString() ?? null,
  };
  if (!actor.isRootAdmin) {
    return detail;
  }

  const [workspaces, audit] = await Promise.all([listUserWorkspaces(user.id), listUserAuditLog(user.id, USER_AUDIT_ROWS)]);
  return { ...detail, workspaces, audit };
}
