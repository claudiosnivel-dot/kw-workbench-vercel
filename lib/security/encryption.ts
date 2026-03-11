import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getEncryptionKeyMaterial } from "@/lib/auth/config";

function getAesKey(): Buffer {
  return createHash("sha256").update(getEncryptionKeyMaterial(), "utf8").digest();
}

export function encryptSecret(plainText: string): string {
  const key = getAesKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(encryptedValue: string): string {
  const [ivPart, tagPart, dataPart] = encryptedValue.split(".");
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Invalid encrypted token payload");
  }

  const key = getAesKey();
  const iv = Buffer.from(ivPart, "base64url");
  const authTag = Buffer.from(tagPart, "base64url");
  const encryptedData = Buffer.from(dataPart, "base64url");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
  return decrypted.toString("utf8");
}
