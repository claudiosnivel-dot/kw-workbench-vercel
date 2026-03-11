import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";

const SINGLETON_KEY = "default";

export type GoogleAdsCredentialSnapshot = {
  connected: boolean;
  connectedEmail?: string;
  customerId?: string;
  loginCustomerId?: string;
  scope?: string;
  tokenType?: string;
  updatedAt?: Date;
};

export async function getGoogleAdsCredentialRecord() {
  return prisma.googleAdsCredential.findUnique({ where: { singleton_key: SINGLETON_KEY } });
}

export async function getGoogleAdsCredentialSnapshot(): Promise<GoogleAdsCredentialSnapshot> {
  const record = await getGoogleAdsCredentialRecord();
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
  refreshToken: string;
  connectedEmail?: string;
  scope?: string;
  tokenType?: string;
  customerId?: string;
  loginCustomerId?: string;
}) {
  const encrypted = encryptSecret(params.refreshToken);

  return prisma.googleAdsCredential.upsert({
    where: { singleton_key: SINGLETON_KEY },
    update: {
      refresh_token_encrypted: encrypted,
      connected_email: params.connectedEmail,
      scope: params.scope,
      token_type: params.tokenType,
      customer_id: params.customerId,
      login_customer_id: params.loginCustomerId,
    },
    create: {
      singleton_key: SINGLETON_KEY,
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
  customerId?: string;
  loginCustomerId?: string;
}) {
  const existing = await getGoogleAdsCredentialRecord();
  if (!existing) {
    return null;
  }

  return prisma.googleAdsCredential.update({
    where: { singleton_key: SINGLETON_KEY },
    data: {
      customer_id: params.customerId || null,
      login_customer_id: params.loginCustomerId || null,
    },
  });
}

export async function clearGoogleAdsCredential() {
  await prisma.googleAdsCredential.deleteMany({ where: { singleton_key: SINGLETON_KEY } });
}

export async function getDecryptedGoogleAdsRefreshToken(): Promise<string | null> {
  const record = await getGoogleAdsCredentialRecord();
  if (!record) {
    return null;
  }

  try {
    return decryptSecret(record.refresh_token_encrypted);
  } catch {
    return null;
  }
}
