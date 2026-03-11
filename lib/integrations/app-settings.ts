import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";

export async function getSettingValue(key: string): Promise<string | null> {
  const setting = await prisma.appSetting.findUnique({ where: { key } });
  if (!setting) {
    return null;
  }

  try {
    return decryptSecret(setting.value_encrypted);
  } catch {
    return null;
  }
}

export async function upsertSettingValue(params: { key: string; value: string; isSecret?: boolean }) {
  return prisma.appSetting.upsert({
    where: { key: params.key },
    update: {
      value_encrypted: encryptSecret(params.value),
      is_secret: Boolean(params.isSecret),
    },
    create: {
      key: params.key,
      value_encrypted: encryptSecret(params.value),
      is_secret: Boolean(params.isSecret),
    },
  });
}

export async function deleteSettingValue(key: string) {
  await prisma.appSetting.deleteMany({ where: { key } });
}

export async function getManySettingValues(keys: string[]): Promise<Record<string, string>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } });
  const out: Record<string, string> = {};

  for (const row of rows) {
    try {
      out[row.key] = decryptSecret(row.value_encrypted);
    } catch {
      // Ignore invalid encrypted payloads.
    }
  }

  return out;
}
