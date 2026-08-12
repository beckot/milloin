import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createOwnerSession } from "./session";

export const OAUTH_STATE_COOKIE = "milloin_oauth_state";
export const OAUTH_VERIFIER_COOKIE = "milloin_oauth_verifier";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const random = (bytes = 32) => randomBytes(bytes).toString("base64url");
const challenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  ownerEmail: string;
  sessionSecret: string;
};

export function startGoogleLogin(config: GoogleConfig): { url: string; state: string; verifier: string } {
  const state = random();
  const verifier = random(48);
  const redirectUri = new URL("/api/auth/google/callback", config.baseUrl).toString();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return { url: url.toString(), state, verifier };
}

export async function finishGoogleLogin(
  config: GoogleConfig,
  input: { code: string; state: string; expectedState: string; verifier: string },
): Promise<{ session: string; email: string; name?: string }> {
  if (!input.state || input.state !== input.expectedState) throw new Error("OAuth state mismatch");
  const redirectUri = new URL("/api/auth/google/callback", config.baseUrl).toString();
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: input.code,
      code_verifier: input.verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenResponse.ok) throw new Error("Google token exchange failed");
  const tokenBody = (await tokenResponse.json()) as { id_token?: string };
  if (!tokenBody.id_token) throw new Error("Google did not return an ID token");

  const { payload } = await jwtVerify(tokenBody.id_token, googleKeys, {
    audience: config.clientId,
    issuer: ["https://accounts.google.com", "accounts.google.com"],
  });
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
  if (!payload.sub || !email || payload.email_verified !== true) throw new Error("Google identity is not a verified email account");
  if (email !== config.ownerEmail.toLowerCase()) throw new Error("This Google account is not allowed to administer this personal instance");
  const name = typeof payload.name === "string" ? payload.name : undefined;
  const session = await createOwnerSession({ sub: payload.sub, email, name }, config.sessionSecret);
  return { session, email, name };
}

export function shortLivedCookie(name: string, value: string, secure = true): string {
  return `${name}=${value}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${secure ? "; Secure" : ""}`;
}

export function clearOauthCookie(name: string, secure = true): string {
  return `${name}=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}
