import { authConfig, isSecureBaseUrl } from "../../../../auth/config";
import { clearSessionCookie } from "../../../../auth/session";

export async function POST() {
  const config = authConfig();
  const response = Response.redirect(new URL("/", config.baseUrl), 303);
  response.headers.set("set-cookie", clearSessionCookie(isSecureBaseUrl(config.baseUrl)));
  response.headers.set("cache-control", "no-store");
  return response;
}
