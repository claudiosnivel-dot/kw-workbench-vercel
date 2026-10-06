import { GOOGLE_SHEETS_SCOPE, hasGrantedScope } from "@/lib/integrations/google-sheets-oauth";
import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";

const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const REVOKE_TIMEOUT_MS = 10_000;

export type GoogleSheetsCredentialStatus = "connected" | "reauth_required" | "disconnected";

export type GoogleSheetsCredentialSnapshot = {
  connected: boolean;
  /** reauth_required: invalid_grant al rinnovo del token o credenziale illeggibile (T-906). */
  status: GoogleSheetsCredentialStatus;
  /** Credenziale con uno scope precedente a drive.file (T-907): l'utente è invitato a ricollegarsi. */
  needsReconnect: boolean;
  connectedEmail?: string;
  scope?: string;
  tokenType?: string;
  updatedAt?: Date;
};

type CredentialRecord = { id: string; refresh_token_encrypted: string };

export async function getGoogleSheetsCredentialRecord(userId: string) {
  return prisma.googleSheetsCredential.findUnique({ where: { user_id: userId } });
}

/** Refresh token in chiaro, o null se la decifratura fallisce: registrata con id e nome dell'errore, mai il valore. */
function decryptRefreshToken(record: CredentialRecord): string | null {
  try {
    return decryptSecret(record.refresh_token_encrypted);
  } catch (error) {
    logger.error("google_sheets_credential_decrypt_failed", {
      credentialId: record.id,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

export async function getGoogleSheetsCredentialSnapshot(userId: string): Promise<GoogleSheetsCredentialSnapshot> {
  const record = await getGoogleSheetsCredentialRecord(userId);
  if (!record) {
    return { connected: false, status: "disconnected", needsReconnect: false };
  }

  // Una credenziale illeggibile non è assente: l'utente deve ricollegarsi.
  const readable = decryptRefreshToken(record) !== null;
  return {
    connected: true,
    status: record.reauth_required_at || !readable ? "reauth_required" : "connected",
    needsReconnect: !hasGrantedScope(record.scope ?? undefined, GOOGLE_SHEETS_SCOPE),
    connectedEmail: record.connected_email ?? undefined,
    scope: record.scope ?? undefined,
    tokenType: record.token_type ?? undefined,
    updatedAt: record.updated_at,
  };
}

/** Salva la credenziale di un nuovo consenso; azzera l'eventuale stato «da ricollegare». */
export async function upsertGoogleSheetsCredential(params: {
  userId: string;
  refreshToken: string;
  connectedEmail?: string;
  scope?: string;
  tokenType?: string;
}) {
  const encrypted = encryptSecret(params.refreshToken);

  return prisma.googleSheetsCredential.upsert({
    where: { user_id: params.userId },
    update: {
      refresh_token_encrypted: encrypted,
      connected_email: params.connectedEmail,
      scope: params.scope,
      token_type: params.tokenType,
      reauth_required_at: null,
    },
    create: {
      user_id: params.userId,
      refresh_token_encrypted: encrypted,
      connected_email: params.connectedEmail,
      scope: params.scope,
      token_type: params.tokenType,
    },
  });
}

/** invalid_grant al rinnovo del token: la credenziale resta ma va ricollegata. */
export async function markGoogleSheetsReauthRequired(userId: string): Promise<void> {
  await prisma.googleSheetsCredential.updateMany({ where: { user_id: userId }, data: { reauth_required_at: new Date() } });
}

/**
 * Disconnessione (T-906): revoca del refresh token presso Google, poi cancellazione della credenziale anche se la
 * revoca fallisce o va in timeout. Restituisce true se Google ha confermato la revoca (200).
 */
export async function revokeAndClearGoogleSheetsCredential(userId: string): Promise<boolean> {
  const record = await getGoogleSheetsCredentialRecord(userId);
  const refreshToken = record ? decryptRefreshToken(record) : null;
  let revoked = false;

  if (refreshToken) {
    try {
      const response = await fetch(REVOKE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refreshToken }),
        cache: "no-store",
        signal: AbortSignal.timeout(REVOKE_TIMEOUT_MS),
      });
      revoked = response.ok;
      if (!revoked) {
        logger.warn("google_sheets_revoke_failed", { userId, status: response.status });
      }
    } catch (error) {
      logger.warn("google_sheets_revoke_failed", { userId, error });
    }
  }

  await prisma.googleSheetsCredential.deleteMany({ where: { user_id: userId } });
  return revoked;
}

export async function getDecryptedGoogleSheetsRefreshToken(userId: string): Promise<string | null> {
  const record = await getGoogleSheetsCredentialRecord(userId);
  return record ? decryptRefreshToken(record) : null;
}
