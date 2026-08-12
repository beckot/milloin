import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const baseUrl = (process.env.MILLOIN_PRODUCTION_URL || "").replace(/\/$/, "");
const ownerApiKey = process.env.MILLOIN_OWNER_API_KEY || "";

if (!baseUrl.startsWith("https://")) {
  throw new Error("MILLOIN_PRODUCTION_URL must be the deployed HTTPS origin");
}
if (!ownerApiKey) throw new Error("MILLOIN_OWNER_API_KEY is required");

const ownerHeaders = {
  authorization: `Bearer ${ownerApiKey}`,
  "content-type": "application/json",
};

const json = async (response, expectedStatus = 200) => {
  const text = await response.text();
  if (response.status !== expectedStatus) {
    throw new Error(`HTTP ${response.status}, expected ${expectedStatus}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : undefined;
};

const api = (path) => `${baseUrl}/api/v1${path}`;
const log = (message) => process.stdout.write(`✓ ${message}\n`);

let pollToken;
let mcpClient;

try {
  const health = await json(await fetch(`${baseUrl}/api/health`));
  assert.equal(health.ok, true);
  log("health endpoint");

  const openApi = await json(await fetch(`${baseUrl}/openapi.json`));
  assert.match(openApi.openapi, /^3\./);
  assert.ok(openApi.paths?.["/polls"]);
  log("OpenAPI discovery");

  const title = `production-smoke-${new Date().toISOString()}-${randomUUID().slice(0, 8)}`;
  const created = await json(
    await fetch(api("/polls"), {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({
        title,
        timezone: "Europe/Helsinki",
        durationMinutes: 60,
      }),
    }),
    201,
  );
  pollToken = created.publicToken;
  assert.ok(pollToken);
  log("owner API creates poll");

  const starts1 = "2026-09-01T15:00:00.000Z";
  const starts2 = "2026-09-02T16:00:00.000Z";
  for (const [id, startsAtUtc] of [
    ["slot-1", starts1],
    ["slot-2", starts2],
  ]) {
    await json(
      await fetch(api(`/polls/${pollToken}/slots`), {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({ id, startsAtUtc }),
      }),
    );
  }
  log("owner API adds candidate slots");

  const publicPoll = await json(await fetch(api(`/polls/${pollToken}`)));
  assert.equal(publicPoll.title, title);
  assert.equal(publicPoll.slots.length, 2);
  assert.equal(publicPoll.ownerId, undefined);
  log("public capability reads poll without leaking owner identity");

  const participant = await json(
    await fetch(api(`/polls/${pollToken}/participants`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Production Anna",
        votes: { "slot-1": "YES", "slot-2": "NO" },
      }),
    }),
    201,
  );
  assert.ok(participant.participantId);
  assert.ok(participant.editToken);
  log("participant capability submits availability");

  const persisted = await json(await fetch(api(`/polls/${pollToken}`), { cache: "no-store" }));
  assert.equal(persisted.participants[0]?.displayName, "Production Anna");
  log("Firestore persistence survives a fresh read");

  const edited = await json(
    await fetch(api(`/polls/${pollToken}/participants/${participant.participantId}`), {
      method: "PUT",
      headers: {
        authorization: `Bearer ${participant.editToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        displayName: "Production Anna 2",
        votes: { "slot-1": "YES", "slot-2": "YES" },
      }),
    }),
  );
  assert.equal(edited.participants[0]?.displayName, "Production Anna 2");

  const invalidEdit = await fetch(api(`/polls/${pollToken}/participants/${participant.participantId}`), {
    method: "PUT",
    headers: {
      authorization: "Bearer definitely-wrong",
      "content-type": "application/json",
    },
    body: JSON.stringify({ displayName: "Intruder", votes: {} }),
  });
  assert.equal(invalidEdit.status, 403);
  log("private participant edit token works and invalid capability is rejected");

  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
  mcpClient = new Client(
    { name: "milloin-production-smoke", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  await mcpClient.connect(transport);

  const mcpPoll = await mcpClient.callTool({ name: "get_poll", arguments: { pollToken } });
  assert.equal(mcpPoll.isError, undefined);
  assert.equal(mcpPoll.structuredContent?.title, title);

  const mcpParticipant = await mcpClient.callTool({
    name: "submit_availability",
    arguments: {
      pollToken,
      displayName: "Production MCP",
      votes: { "slot-1": "NO", "slot-2": "YES" },
    },
  });
  assert.notEqual(mcpParticipant.isError, true);

  const mcpResults = await mcpClient.callTool({ name: "get_results", arguments: { pollToken } });
  assert.notEqual(mcpResults.isError, true);
  assert.equal(mcpResults.structuredContent?.yesCounts?.["slot-1"], 1);
  assert.equal(mcpResults.structuredContent?.yesCounts?.["slot-2"], 2);
  log("remote MCP client reads, votes and gets results without browser automation");

  const winner = await json(
    await fetch(api(`/polls/${pollToken}/winner`), {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ slotId: "slot-2" }),
    }),
  );
  assert.equal(winner.status, "CLOSED");
  assert.equal(winner.winnerSlotId, "slot-2");

  const rejectedWhileClosed = await fetch(api(`/polls/${pollToken}/participants`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Too late", votes: { "slot-1": "YES" } }),
  });
  assert.equal(rejectedWhileClosed.status, 409);

  const calendar = await fetch(api(`/polls/${pollToken}/calendar.ics`));
  assert.equal(calendar.status, 200);
  assert.match(calendar.headers.get("content-type") || "", /text\/calendar/);
  const calendarText = await calendar.text();
  assert.match(calendarText, /BEGIN:VCALENDAR/);
  assert.match(calendarText, /DTSTART:20260902T160000Z/);
  log("winner closes poll and ICS contains the selected slot");

  const reopened = await json(
    await fetch(api(`/polls/${pollToken}/reopen`), {
      method: "POST",
      headers: ownerHeaders,
    }),
  );
  assert.equal(reopened.status, "OPEN");
  log("owner can reopen poll");

  await json(
    await fetch(api(`/polls/${pollToken}`), { method: "DELETE", headers: ownerHeaders }),
    204,
  );
  pollToken = undefined;
  log("owner deletes poll");

  const missing = await fetch(api(`/polls/${created.publicToken}`));
  assert.equal(missing.status, 404);
  log("deleted poll is gone");

  process.stdout.write("\nProduction API/MCP smoke passed.\n");
} finally {
  if (mcpClient) await mcpClient.close().catch(() => undefined);
  if (pollToken) {
    await fetch(api(`/polls/${pollToken}`), { method: "DELETE", headers: ownerHeaders }).catch(() => undefined);
  }
}
