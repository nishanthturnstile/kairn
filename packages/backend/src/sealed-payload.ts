import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function sealPayload(key: Buffer, context: string, value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    "base64url",
  );
}

export function unsealPayload(
  key: Buffer,
  context: string,
  value: string,
): unknown {
  const bytes = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(bytes.subarray(12, 28));
  const plaintext = Buffer.concat([
    decipher.update(bytes.subarray(28)),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString());
}
