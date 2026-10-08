import { createHash } from "node:crypto";
import type { Prisma } from "@/lib/generated/prisma/client";
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

/**
 * Pagina del registro (T-1704): 50 righe ordinate per created_at e id decrescenti, con l'email dell'autore se esiste
 * ancora; nextCursor null all'ultima pagina. Un cursore illeggibile riparte dalla prima pagina.
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
  const actorIds = [...new Set(page.flatMap((row) => (row.actor_user_id ? [row.actor_user_id] : [])))];
  const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } });
  const emails = new Map(actors.map((actor) => [actor.id, actor.email]));

  return {
    rows: page.map((row) => ({
      id: row.id,
      createdAt: row.created_at.toISOString(),
      action: row.action,
      actorUserId: row.actor_user_id,
      actorEmail: row.actor_user_id ? (emails.get(row.actor_user_id) ?? null) : null,
      targetType: row.target_type,
      targetId: row.target_id,
      metadata: row.metadata,
      ip: row.ip,
    })),
    nextCursor: rows.length > AUDIT_PAGE_SIZE ? encodeCursor(page[page.length - 1]) : null,
  };
}
