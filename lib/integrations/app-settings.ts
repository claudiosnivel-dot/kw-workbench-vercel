import { logger } from "@/lib/observability/logger";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";

/** Valore in chiaro, o null se la decifratura fallisce: registrata con chiave e nome dell'errore, mai il valore (T-906). */
function decryptSetting(setting: { key: string; value_encrypted: string }): string | null {
  try {
    return decryptSecret(setting.value_encrypted);
  } catch (error) {
    logger.error("app_setting_decrypt_failed", {
      key: setting.key,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

/** Restituisce la PrismaPromise non ancora eseguita: si può attendere o passare a prisma.$transaction. */
export function upsertSettingValue(params: { key: string; value: string }) {
  return prisma.appSetting.upsert({
    where: { key: params.key },
    update: {
      value_encrypted: encryptSecret(params.value),
    },
    create: {
      key: params.key,
      value_encrypted: encryptSecret(params.value),
    },
  });
}

/** Restituisce la PrismaPromise non ancora eseguita: si può attendere o passare a prisma.$transaction. */
export function deleteSettingValue(key: string) {
  return prisma.appSetting.deleteMany({ where: { key } });
}

export async function getManySettingValues(keys: string[]): Promise<Record<string, string>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } });
  const out: Record<string, string> = {};

  for (const row of rows) {
    const value = decryptSetting(row);
    if (value !== null) {
      out[row.key] = value;
    }
  }

  return out;
}
