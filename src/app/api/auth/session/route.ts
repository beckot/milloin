import { authConfig } from "../../../../auth/config";
import { readOwnerSession, requestCookie, SESSION_COOKIE } from "../../../../auth/session";

export async function GET(request: Request) {
  const config = authConfig();
  const session = await readOwnerSession(requestCookie(request, SESSION_COOKIE), config.sessionSecret);
  if (!session || session.email !== config.ownerEmail) {
    return Response.json({ authenticated: false }, { headers: { "cache-control": "no-store" } });
  }
  return Response.json(
    { authenticated: true, user: { email: session.email, name: session.name } },
    { headers: { "cache-control": "no-store" } },
  );
}
