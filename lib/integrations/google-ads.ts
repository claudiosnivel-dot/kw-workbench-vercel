import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";

const LEGACY_SINGLETON_KEY = "default";

export type GoogleAdsCredentialSnapshot = {
  connected: boolean;
  connectedEmail?: string;
  customerId?: string;
  loginCustomerId?: string;
  scope?: string;
  tokenType?: string;
  updatedAt?: Date;
};

export async function getGoogleAdsCredentialRecord(userId?: string) {
  if (userId) {
    return prisma.googleAdsCredential.findUnique({ where: { user_id: userId } });
  }

  return prisma.googleAdsCredential.findFirst({
    where: {
      OR: [{ singleton_key: LEGACY_SINGLETON_KEY }, { user_id: null }],
    },
    orderBy: { updated_at: "desc" },
  });
}

export async function getGoogleAdsCredentialSnapshot(userId: string): Promise<GoogleAdsCredentialSnapshot> {
  const record = await getGoogleAdsCredentialRecord(userId);
  if (!record) {
    return { connected: false };
  }

  return {
    connected: true,
    connectedEmail: record.connected_email ?? undefined,
    customerId: record.customer_id ?? undefined,
    loginCustomerId: record.login_customer_id ?? undefined,
    scope: record.scope ?? undefined,
    tokenType: record.token_type ?? undefined,
    updatedAt: record.updated_at,
  };
}

export async function upsertGoogleAdsCredential(params: {
  userId: string;
  refreshToken: string;
  connectedEmail?: string;
  scope?: string;
  tokenType?: string;
  customerId?: string;
  loginCustomerId?: string;
}) {
  const encrypted = encryptSecret(params.refreshToken);

  return prisma.googleAdsCredential.upsert({
    where: { user_id: params.userId },
    update: {
      refresh_token_encrypted: encrypted,
      connected_email: params.connectedEmail,
      scope: params.scope,
      token_type: params.tokenType,
      customer_id: params.customerId,
      login_customer_id: params.loginCustomerId,
      singleton_key: null,
    },
    create: {
      user_id: params.userId,
      singleton_key: null,
      refresh_token_encrypted: encrypted,
      connected_email: params.connectedEmail,
      scope: params.scope,
      token_type: params.tokenType,
      customer_id: params.customerId,
      login_customer_id: params.loginCustomerId,
    },
  });
}

export async function updateGoogleAdsCustomerSettings(params: {
  userId: string;
  customerId?: string;
  loginCustomerId?: string;
}) {
  const existing = await getGoogleAdsCredentialRecord(params.userId);
  if (!existing) {
    return null;
  }

  return prisma.googleAdsCredential.update({
    where: { user_id: params.userId },
    data: {
      customer_id: params.customerId || null,
      login_customer_id: params.loginCustomerId || null,
    },
  });
}

export async function clearGoogleAdsCredential(userId: string) {
  await prisma.googleAdsCredential.deleteMany({ where: { user_id: userId } });
}

export async function getDecryptedGoogleAdsRefreshToken(userId?: string): Promise<string | null> {
  const record = await getGoogleAdsCredentialRecord(userId);
  if (!record) {
    return null;
  }

  try {
    return decryptSecret(record.refresh_token_encrypted);
  } catch {
    return null;
  }
}
