import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

const SESSION_TTL_DAYS = 30;

function toHex(value: Buffer): string {
  return value.toString("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(password, salt, 64);
  return `${toHex(salt)}:${toHex(derivedKey)}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [saltHex, derivedKeyHex] = storedHash.split(":");
  if (!saltHex || !derivedKeyHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(derivedKeyHex, "hex");
  const actual = scryptSync(password, salt, expected.length);

  return timingSafeEqual(expected, actual);
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionExpiry(): string {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);
  return expiresAt.toISOString();
}
