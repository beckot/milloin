import { describe, expect, it } from "vitest";
import { createOwnerSession, readOwnerSession, ownerAuthenticator } from "./session";

const secret = "0123456789abcdef0123456789abcdef";

describe("owner sessions", () => {
  it("round trips a signed owner session", async () => {
    const value = await createOwnerSession({ sub: "google-123", email: "otto@example.com", name: "Otto" }, secret, new Date("2026-08-12T03:00:00Z"));
    const session = await readOwnerSession(value, secret, new Date("2026-08-12T04:00:00Z"));
    expect(session?.sub).toBe("google-123");
    expect(session?.email).toBe("otto@example.com");
  });

  it("rejects tampering and expiry", async () => {
    const value = await createOwnerSession({ sub: "google-123", email: "otto@example.com" }, secret, new Date("2026-08-01T00:00:00Z"), 60);
    const tampered = value.slice(0, -1) + (value.endsWith("a") ? "b" : "a");
    expect(await readOwnerSession(tampered, secret)).toBeNull();
    expect(await readOwnerSession(value, secret, new Date("2026-08-01T00:02:00Z"))).toBeNull();
  });

  it("maps human Google session and external agent credential to the same owner", async () => {
    const value = await createOwnerSession({ sub: "google-123", email: "otto@example.com" }, secret);
    const auth = ownerAuthenticator({ sessionSecret: secret, ownerApiKey: "agent-key", ownerEmail: "otto@example.com" });

    const human = new Request("https://milloin.test/api/v1/polls", { headers: { cookie: `milloin_session=${value}` } });
    const agent = new Request("https://milloin.test/api/v1/polls", { headers: { authorization: "Bearer agent-key" } });

    expect(await auth(human)).toBe("owner:otto@example.com");
    expect(await auth(agent)).toBe("owner:otto@example.com");
  });

  it("rejects a signed Google session for a different email on a personal instance", async () => {
    const value = await createOwnerSession({ sub: "google-999", email: "other@example.com" }, secret);
    const auth = ownerAuthenticator({ sessionSecret: secret, ownerEmail: "otto@example.com" });
    const request = new Request("https://milloin.test/api/v1/polls", { headers: { cookie: `milloin_session=${value}` } });
    expect(await auth(request)).toBeNull();
  });
});
