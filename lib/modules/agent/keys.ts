import { createHash, randomBytes } from "node:crypto";
import { writeAuditLog } from "@/lib/admin/audit";
import { type AuthUser, findAuthUserById } from "@/lib/auth/credentials";
import { isRootAdminUser } from "@/lib/auth/current-user";
import { UserStatus } from "@/lib/generated/prisma/enums";
import { ValidationError } from "@/lib/http/errors";
import {
  AGENT_KEY_DURATIONS,
  type AgentKeyDuration,
  type AgentKeyStatus,
  type CreatedAgentKey,
} from "@/lib/modules/agent/key-types";
import { prisma } from "@/lib/prisma";

// Chiave personale di Claude Code del root admin (T-7101, D-64). In chiaro esiste solo nella risposta della creazione:
// il DB tiene l'hash SHA-256 e il prefisso mostrato nella card (CWE-256, CWE-798).

const KEY_START = "tsk_";
const PREFIX_LENGTH = 8;
const DAY_MS = 24 * 60 * 60 * 1000;
/** «tsk_» più 43 caratteri base64url: un valore più lungo non è una chiave e non si calcola nemmeno l'hash. */
const MAX_KEY_LENGTH = 64;

type AgentKeyRow = {
  prefix: string;
  created_at: Date;
  expires_at: Date | null;
  last_used_at: Date | null;
  revoked_at: Date | null;
};

const STATUS_SELECT = { prefix: true, created_at: true, expires_at: true, last_used_at: true, revoked_at: true } as const;

function hashAgentKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function isExpired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

function toStatus(row: AgentKeyRow, now = new Date()): AgentKeyStatus {
  return {
    prefix: row.prefix,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at?.toISOString() ?? null,
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
    active: row.revoked_at === null && !isExpired(row.expires_at, now),
  };
}

function parseDuration(input: unknown): AgentKeyDuration {
  const duration = (input as { duration?: unknown } | null)?.duration;
  const match = AGENT_KEY_DURATIONS.find((allowed) => allowed === duration);
  if (match === undefined) {
    throw new ValidationError("duration deve essere 30, 60, 90 oppure never");
  }
  return match;
}

/**
 * Nuova chiave del root admin con la durata scelta (30, 60, 90 giorni o never): «tsk_» più 32 byte casuali in base64url
 * (CWE-330), salvata come hash con i primi 8 caratteri dopo «tsk_». Nella stessa transazione revoca la chiave ancora
 * attiva dell'utente e scrive agent_key.create nel registro delle azioni amministrative, senza la chiave (CWE-532).
 * L'indice parziale agent_keys_single_active_idx impedisce due chiavi attive anche con due richieste insieme (409).
 */
export async function createAgentKey(user: AuthUser, input: unknown, ip: string | null = null): Promise<CreatedAgentKey> {
  const duration = parseDuration(input);
  const key = `${KEY_START}${randomBytes(32).toString("base64url")}`;
  const prefix = key.slice(KEY_START.length, KEY_START.length + PREFIX_LENGTH);
  const now = new Date();
  const expiresAt = duration === "never" ? null : new Date(now.getTime() + duration * DAY_MS);

  const row = await prisma.$transaction(async (tx) => {
    const replaced = await tx.agentKey.updateMany({ where: { user_id: user.id, revoked_at: null }, data: { revoked_at: now } });
    const created = await tx.agentKey.create({
      data: { user_id: user.id, prefix, key_hash: hashAgentKey(key), created_at: now, expires_at: expiresAt },
      select: { id: true, ...STATUS_SELECT },
    });
    await writeAuditLog(tx, {
      actorUserId: user.id,
      action: "agent_key.create",
      targetType: "agent_key",
      targetId: created.id,
      metadata: { prefix, duration: String(duration), expiresAt: expiresAt?.toISOString() ?? null, replaced: replaced.count },
      ip,
    });
    return created;
  });

  return { key, status: toStatus(row, now) };
}

/**
 * Revoca subito la chiave non revocata del root admin, con agent_key.revoke nel registro; senza chiave da revocare non
 * scrive nulla. Restituisce lo stato dell'ultima chiave dopo la revoca.
 */
export async function revokeAgentKey(user: AuthUser, ip: string | null = null): Promise<AgentKeyStatus | null> {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const open = await tx.agentKey.findMany({ where: { user_id: user.id, revoked_at: null }, select: { id: true, prefix: true } });
    if (open.length === 0) {
      return;
    }
    await tx.agentKey.updateMany({ where: { id: { in: open.map((row) => row.id) } }, data: { revoked_at: now } });
    for (const row of open) {
      await writeAuditLog(tx, { actorUserId: user.id, action: "agent_key.revoke", targetType: "agent_key", targetId: row.id, metadata: { prefix: row.prefix }, ip });
    }
  });
  return agentKeyStatus(user);
}

/** Stato dell'ultima chiave creata dall'utente (attiva, revocata o scaduta), null se non ne ha mai create. */
export async function agentKeyStatus(user: Pick<AuthUser, "id">): Promise<AgentKeyStatus | null> {
  const row = await prisma.agentKey.findFirst({
    where: { user_id: user.id },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    select: STATUS_SELECT,
  });
  return row ? toStatus(row) : null;
}

/**
 * Verifica della chiave di una richiesta (T-7101, usata dal server MCP del modulo 72). La chiave si cerca per hash,
 * quindi il testo in chiaro non si confronta mai (CWE-208). null se la chiave non esiste, è revocata o scaduta, o se il
 * suo utente non è ACTIVE, ADMIN e root admin o ha il cambio password in sospeso; ruolo e stato si rileggono a ogni
 * chiamata (CWE-285). Altrimenti l'utente e l'id della chiave.
 */
export async function verifyAgentKey(token: string | null | undefined): Promise<{ user: AuthUser; keyId: string } | null> {
  if (!token || !token.startsWith(KEY_START) || token.length > MAX_KEY_LENGTH) {
    return null;
  }
  const key = await prisma.agentKey.findUnique({
    where: { key_hash: hashAgentKey(token) },
    select: { id: true, user_id: true, expires_at: true, revoked_at: true },
  });
  if (!key || key.revoked_at !== null || isExpired(key.expires_at, new Date())) {
    return null;
  }
  const user = await findAuthUserById(key.user_id);
  if (!user || user.status !== UserStatus.ACTIVE || !isRootAdminUser(user) || user.mustChangePassword) {
    return null;
  }
  return { user, keyId: key.id };
}
