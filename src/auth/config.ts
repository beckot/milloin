import type { GoogleConfig } from "./google";

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
};

export function authConfig(): GoogleConfig & { ownerApiKey?: string } {
  return {
    clientId: required("GOOGLE_CLIENT_ID"),
    clientSecret: required("GOOGLE_CLIENT_SECRET"),
    baseUrl: required("MILLOIN_BASE_URL"),
    ownerEmail: required("MILLOIN_OWNER_EMAIL").toLowerCase(),
    sessionSecret: required("MILLOIN_SESSION_SECRET"),
    ownerApiKey: process.env.MILLOIN_OWNER_API_KEY?.trim() || undefined,
  };
}

export function isSecureBaseUrl(baseUrl: string): boolean {
  return new URL(baseUrl).protocol === "https:";
}
