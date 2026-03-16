import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";

export type GoogleSheetsCredentialSnapshot = {
  connected: boolean;
  connectedEmail?: string;
  scope?: string;
  tokenType?: string;
  updatedAt?: Date;
};

export async function getGoogleSheetsCredentialRecord(userId: string) {
  return prisma.googleSheetsCredential.findUnique({ where: { user_id: userId } });
}

export async function getGoogleSheetsCredentialSnapshot(userId: string): Promise<GoogleSheetsCredentialSnapshot> {
  const record = await getGoogleSheetsCredentialRecord(userId);
  if (!record) {
    return { connected: false };
  }

  return {
    connected: true,
    connectedEmail: record.connected_email ?? undefined,
    scope: record.scope ?? undefined,
    tokenType: record.token_type ?? undefined,
    updatedAt: record.updated_at,
  };
}

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

export async function clearGoogleSheetsCredential(userId: string) {
  await prisma.googleSheetsCredential.deleteMany({ where: { user_id: userId } });
}

export async function getDecryptedGoogleSheetsRefreshToken(userId: string): Promise<string | null> {
  const record = await getGoogleSheetsCredentialRecord(userId);
  if (!record) {
    return null;
  }

  try {
    return decryptSecret(record.refresh_token_encrypted);
  } catch {
    return null;
  }
}