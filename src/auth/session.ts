import { createHmac, timingSafeEqual } from "node:crypto";
import type { OwnerAuthenticator } from "../api/http-api";

export const SESSION_COOKIE = "milloin_session";

export type OwnerSession = { sub: string; email: string; name?: string; exp: number };
type SessionInput = Omit<OwnerSession, "exp">;

const encode = (value: string) => Buffer.from(value, "utf8").toString("base64url");
const decode = (value: string) => Buffer.from(value, "base64url").toString("utf8");
const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");
const safeEqual = (left: string, right: string): boolean => {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

export async function createOwnerSession(input: SessionInput, secret: string, now = new Date(), ttlSeconds = 2_592_000): Promise<string> {
  if (secret.length < 32) throw new Error("Session secret must be at least 32 characters");
  const payload = encode(JSON.stringify({ ...input, email: input.email.toLowerCase(), exp: Math.floor(now.getTime() / 1000) + ttlSeconds } satisfies OwnerSession));
  return `${payload}.${sign(payload, secret)}`;
}

export async function readOwnerSession(value: string | undefined, secret: string, now = new Date()): Promise<OwnerSession | null> {
  if (!value || secret.length < 32) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra || !safeEqual(signature, sign(payload, secret))) return null;
  try {
    const parsed = JSON.parse(decode(payload)) as Partial<OwnerSession>;
    if (!parsed.sub || !parsed.email || !parsed.exp || parsed.exp <= Math.floor(now.getTime() / 1000)) return null;
    return { sub: parsed.sub, email: parsed.email.toLowerCase(), name: parsed.name, exp: parsed.exp };
  } catch { return null; }
}

export function requestCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

export function ownerAuthenticator(config: { sessionSecret: string; ownerEmail: string; ownerApiKey?: string }): OwnerAuthenticator {
  const expectedEmail = config.ownerEmail.trim().toLowerCase();
  const ownerId = `owner:${expectedEmail}`;
  return async (request) => {
    const session = await readOwnerSession(requestCookie(request, SESSION_COOKIE), config.sessionSecret);
    if (session?.email === expectedEmail) return ownerId;
    const authorization = request.headers.get("authorization");
    if (config.ownerApiKey && authorization?.startsWith("Bearer ")) {
      const supplied = authorization.slice(7).trim();
      if (supplied && safeEqual(supplied, config.ownerApiKey)) return ownerId;
    }
    return null;
  };
}

export function sessionCookie(value: string, secure = true): string {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure ? "; Secure" : ""}`;
}
export function clearSessionCookie(secure = true): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}
