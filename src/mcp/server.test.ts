import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";
import { PollService } from "../application/poll-service";
import { InMemoryPollRepository } from "../infrastructure/in-memory-poll-repository";
import { createMilloinMcpHandler } from "./server";

const requiredTools = [
  "get_poll",
  "create_poll",
  "add_time_slots",
  "remove_time_slot",
  "submit_availability",
  "update_availability",
  "get_results",
  "select_winner",
  "close_poll",
  "reopen_poll",
];

type Handler = ReturnType<typeof createMilloinMcpHandler>;
type Harness = { client: Client; handler: Handler };
const openHarnesses: Harness[] = [];

async function connect(
  handler: Handler,
  authorization?: string,
): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL("http://test.local/mcp"), {
    fetch: (url, init) => {
      const headers = new Headers(init?.headers);
      if (authorization) headers.set("authorization", authorization);
      return handler.fetch(new Request(url, { ...init, headers }));
    },
  });
  const client = new Client(
    { name: "milloin-test", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  await client.connect(transport);
  openHarnesses.push({ client, handler });
  return client;
}

const structured = <T>(result: { structuredContent?: unknown }): T =>
  result.structuredContent as T;

afterEach(async () => {
  const uniqueHandlers = new Set<Handler>();
  while (openHarnesses.length) {
    const harness = openHarnesses.pop()!;
    uniqueHandlers.add(harness.handler);
    await harness.client.close();
  }
  for (const handler of uniqueHandlers) await handler.close();
});

describe("milloin MCP", () => {
  it("exposes the complete scheduling tool surface", async () => {
    const service = new PollService(new InMemoryPollRepository());
    const handler = createMilloinMcpHandler(service, async () => "owner-1");
    const client = await connect(handler, "Bearer owner-key");

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(requiredTools));
  });

  it("runs organizer and participant scheduling through a real MCP client", async () => {
    const service = new PollService(new InMemoryPollRepository());
    const handler = createMilloinMcpHandler(service, async (request) =>
      request?.headers.get("authorization") === "Bearer owner-key" ? "owner-1" : null,
    );
    const owner = await connect(handler, "Bearer owner-key");

    const created = await owner.callTool({
      name: "create_poll",
      arguments: {
        title: "Saunailta",
        timezone: "Europe/Helsinki",
        durationMinutes: 60,
      },
    });
    expect(created.isError).not.toBe(true);
    const { publicToken } = structured<{ publicToken: string }>(created);
    expect(publicToken).toBeTruthy();

    const addSlots = await owner.callTool({
      name: "add_time_slots",
      arguments: {
        pollToken: publicToken,
        slots: [
          { id: "slot-1", startsAtUtc: "2026-08-20T15:00:00.000Z" },
          { id: "slot-2", startsAtUtc: "2026-08-21T16:00:00.000Z" },
        ],
      },
    });
    expect(addSlots.isError).not.toBe(true);

    const participant = await connect(handler);
    const publicPoll = await participant.callTool({
      name: "get_poll",
      arguments: { pollToken: publicToken },
    });
    expect(structured<{ title: string }>(publicPoll).title).toBe("Saunailta");

    const submitted = await participant.callTool({
      name: "submit_availability",
      arguments: {
        pollToken: publicToken,
        displayName: "Anna",
        votes: { "slot-1": "YES", "slot-2": "NO" },
      },
    });
    expect(submitted.isError).not.toBe(true);
    const response = structured<{ participantId: string; editToken: string }>(submitted);
    expect(response.participantId).toBeTruthy();
    expect(response.editToken).toBeTruthy();

    const updated = await participant.callTool({
      name: "update_availability",
      arguments: {
        pollToken: publicToken,
        participantId: response.participantId,
        editToken: response.editToken,
        displayName: "Anna 2",
        votes: { "slot-1": "YES", "slot-2": "YES" },
      },
    });
    expect(updated.isError).not.toBe(true);

    const results = await participant.callTool({
      name: "get_results",
      arguments: { pollToken: publicToken },
    });
    const resultsBody = structured<{
      yesCounts: Record<string, number>;
      participants: Array<{ displayName: string }>;
    }>(results);
    expect(resultsBody.yesCounts["slot-1"]).toBe(1);
    expect(resultsBody.yesCounts["slot-2"]).toBe(1);
    expect(resultsBody.participants[0]?.displayName).toBe("Anna 2");

    const winner = await owner.callTool({
      name: "select_winner",
      arguments: { pollToken: publicToken, slotId: "slot-2" },
    });
    expect(structured<{ status: string; winnerSlotId: string }>(winner)).toMatchObject({
      status: "CLOSED",
      winnerSlotId: "slot-2",
    });

    const reopened = await owner.callTool({
      name: "reopen_poll",
      arguments: { pollToken: publicToken },
    });
    expect(structured<{ status: string }>(reopened).status).toBe("OPEN");
  });

  it("rejects organizer MCP tools without owner authorization", async () => {
    const service = new PollService(new InMemoryPollRepository());
    const handler = createMilloinMcpHandler(service, async () => null);
    const client = await connect(handler);

    const result = await client.callTool({
      name: "create_poll",
      arguments: {
        title: "Private",
        timezone: "Europe/Helsinki",
        durationMinutes: 60,
      },
    });
    expect(result.isError).toBe(true);
  });
});
