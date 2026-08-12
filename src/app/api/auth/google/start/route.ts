import { authConfig, isSecureBaseUrl } from "../../../../../auth/config";
import { OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE, shortLivedCookie, startGoogleLogin } from "../../../../../auth/google";

export async function GET() {
  const config = authConfig();
  const secure = isSecureBaseUrl(config.baseUrl);
  const login = startGoogleLogin(config);
  const response = Response.redirect(login.url, 302);
  response.headers.append("set-cookie", shortLivedCookie(OAUTH_STATE_COOKIE, login.state, secure));
  response.headers.append("set-cookie", shortLivedCookie(OAUTH_VERIFIER_COOKIE, login.verifier, secure));
  response.headers.set("cache-control", "no-store");
  return response;
}
