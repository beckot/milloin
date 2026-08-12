import { authConfig, isSecureBaseUrl } from "../../../../../auth/config";
import { clearOauthCookie, finishGoogleLogin, OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE } from "../../../../../auth/google";
import { requestCookie, sessionCookie } from "../../../../../auth/session";

export async function GET(request: Request) {
  const config = authConfig();
  const secure = isSecureBaseUrl(config.baseUrl);
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const expectedState = requestCookie(request, OAUTH_STATE_COOKIE) || "";
  const verifier = requestCookie(request, OAUTH_VERIFIER_COOKIE) || "";

  try {
    if (!code || !state || !expectedState || !verifier) throw new Error("Incomplete OAuth callback");
    const result = await finishGoogleLogin(config, { code, state, expectedState, verifier });
    const response = Response.redirect(new URL("/", config.baseUrl), 302);
    response.headers.append("set-cookie", sessionCookie(result.session, secure));
    response.headers.append("set-cookie", clearOauthCookie(OAUTH_STATE_COOKIE, secure));
    response.headers.append("set-cookie", clearOauthCookie(OAUTH_VERIFIER_COOKIE, secure));
    response.headers.set("cache-control", "no-store");
    return response;
  } catch {
    const response = Response.redirect(new URL("/?auth=failed", config.baseUrl), 302);
    response.headers.append("set-cookie", clearOauthCookie(OAUTH_STATE_COOKIE, secure));
    response.headers.append("set-cookie", clearOauthCookie(OAUTH_VERIFIER_COOKIE, secure));
    response.headers.set("cache-control", "no-store");
    return response;
  }
}
