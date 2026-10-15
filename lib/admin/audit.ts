import { createHash } from "node:crypto";
import type { AdminAuditLog, Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Registro delle azioni amministrative (T-1704): ogni riga nasce nella stessa transazione dell'azione, quindi un'azione
 * rifiutata non scrive nulla; nessuna API di modifica o cancellazione (CWE-778). I metadata contengono solo i campi
 * cambiati con il valore prima e dopo, mai password, hash, token o data URL (CWE-532).
 */
export type AdminAuditAction =
  | "user.create"
  | "user.password_reset"
  | "user.suspend"
  | "user.reactivate"
  | "user.role_change"
  | "user.delete"
  // Cambio dell'email da parte del root admin (T-3402): riga senza indirizzi (CWE-532).
  | "user.email_change"
  // Cancellazione dell'account da parte dell'utente (T-2001): riga anonima, senza attore, bersaglio, metadata né IP.
  | "account.delete"
  | "branding.update"
  // Cambio dell'interruttore del lancio commerciale (T-1606, D-32).
  | "launch.update"
  // Tetto dei rimborsi automatici della quota raggiunto (T-1703, D-27 emendata): evento di sistema, actor null.
  | "quota.refund_cap_reached";

export type AuditEntry = {
  actorUserId: string | null;
  action: AdminAuditAction;
  targetType: "user" | "branding" | "launch" | "workspace";
  targetId?: string | null;
  metadata?: Prisma.InputJsonObject;
  ip?: string | null;
};

/** Client che scrive la riga: la transazione dell'azione, o il client globale dentro un $transaction a lotto. */
type AuditWriter = Pick<Prisma.TransactionClient, "adminAuditLog">;

export function writeAuditLog(db: AuditWriter, entry: AuditEntry) {
  return db.adminAuditLog.create({
    data: {
      actor_user_id: entry.actorUserId,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId ?? null,
      metadata: entry.metadata ?? {},
      ip: entry.ip ?? null,
    },
  });
}

/** Impronta SHA-256 di un valore da non registrare per intero (logo del branding come data URL), null se assente. */
export function auditFingerprint(value: string | null | undefined): string | null {
  return value ? `sha256:${createHash("sha256").update(value).digest("hex")}` : null;
}

export const AUDIT_PAGE_SIZE = 50;

export type AuditLogRow = {
  id: string;
  createdAt: string;
  action: string;
  actorUserId: string | null;
  actorEmail: string | null;
  targetType: string;
  targetId: string | null;
  /** Nome mostrato del bersaglio quando è un utente che esiste ancora (T-3401): la riga porta alla sua scheda. */
  targetUserName: string | null;
  metadata: Prisma.JsonValue;
  ip: string | null;
};

// Cursore opaco della pagina successiva: istante e id dell'ultima riga, in base64url.
function encodeCursor(row: { created_at: Date; id: string }): string {
  return Buffer.from(`${row.created_at.toISOString()}|${row.id}`).toString("base64url");
}

function decodeCursor(cursor: string | null | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) {
    return null;
  }
  const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  const createdAt = new Date(iso ?? "");
  return id && !Number.isNaN(createdAt.getTime()) ? { createdAt, id } : null;
}

/** Utenti citati dalle righe (autori e bersagli) che esistono ancora, letti con una sola query. */
async function toAuditRows(rows: AdminAuditLog[]): Promise<AuditLogRow[]> {
  const userIds = new Set<string>();
  for (const row of rows) {
    if (row.actor_user_id) userIds.add(row.actor_user_id);
    if (row.target_type === "user" && row.target_id) userIds.add(row.target_id);
  }
  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, email: true, display_name: true },
  });
  const byId = new Map(users.map((user) => [user.id, user]));

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at.toISOString(),
    action: row.action,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_user_id ? (byId.get(row.actor_user_id)?.email ?? null) : null,
    targetType: row.target_type,
    targetId: row.target_id,
    targetUserName: row.target_type === "user" && row.target_id ? (byId.get(row.target_id)?.display_name ?? null) : null,
    metadata: row.metadata,
    ip: row.ip,
  }));
}

/**
 * Pagina del registro (T-1704): 50 righe ordinate per created_at e id decrescenti, con l'email dell'autore e il nome del
 * bersaglio se esistono ancora; nextCursor null all'ultima pagina. Un cursore illeggibile riparte dalla prima pagina.
 */
export async function listAuditLog(cursor?: string | null): Promise<{ rows: AuditLogRow[]; nextCursor: string | null }> {
  const after = decodeCursor(cursor);
  const rows = await prisma.adminAuditLog.findMany({
    where: after
      ? { OR: [{ created_at: { lt: after.createdAt } }, { created_at: after.createdAt, id: { lt: after.id } }] }
      : {},
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: AUDIT_PAGE_SIZE + 1,
  });
  const page = rows.slice(0, AUDIT_PAGE_SIZE);

  return {
    rows: await toAuditRows(page),
    nextCursor: rows.length > AUDIT_PAGE_SIZE ? encodeCursor(page[page.length - 1]) : null,
  };
}

/** Ultime righe del registro con bersaglio l'utente (T-3401), dalla più recente: la parte Registro della sua scheda. */
export async function listUserAuditLog(userId: string, take = 20): Promise<AuditLogRow[]> {
  const rows = await prisma.adminAuditLog.findMany({
    where: { target_type: "user", target_id: userId },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take,
  });
  return toAuditRows(rows);
}
