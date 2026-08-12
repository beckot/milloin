import { randomUUID } from "node:crypto";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import type { PollService } from "../application/poll-service";
import type { Poll, Vote } from "../domain/poll";

export type McpOwnerResolver = (request?: Request) => Promise<string | null>;

const pollTokenSchema = z.string().min(1);
const voteSchema = z.enum(["YES", "NO"]);
const votesSchema = z.record(z.string().min(1), voteSchema);
const slotSchema = z.object({
  id: z.string().min(1).optional(),
  startsAtUtc: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid timestamp"),
});

const success = (value: Record<string, unknown>) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
  structuredContent: value,
});

const failure = (error: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: error instanceof Error ? error.message : "Unexpected scheduling error",
    },
  ],
  isError: true,
});

const publicPoll = (poll: Poll): Record<string, unknown> => ({
  id: poll.id,
  title: poll.title,
  description: poll.description,
  location: poll.location,
  timezone: poll.timezone,
  durationMinutes: poll.durationMinutes,
  status: poll.status,
  winnerSlotId: poll.winnerSlotId,
  slots: poll.slots,
  participants: poll.participants,
});

const resultView = (poll: Poll): Record<string, unknown> => ({
  ...publicPoll(poll),
  yesCounts: Object.fromEntries(
    poll.slots.map((slot) => [
      slot.id,
      poll.participants.filter((participant) => participant.votes[slot.id] === "YES").length,
    ]),
  ),
});

async function requireOwner(resolveOwner: McpOwnerResolver, request?: Request): Promise<string> {
  const ownerId = await resolveOwner(request);
  if (!ownerId) throw new Error("Organizer authorization required");
  return ownerId;
}

export function createMilloinMcpServer(
  service: PollService,
  resolveOwner: McpOwnerResolver,
): McpServer {
  const server = new McpServer({ name: "milloin", version: "1.0.0" });

  server.registerTool(
    "get_poll",
    {
      description: "Read a scheduling poll and its current participant responses.",
      inputSchema: z.object({ pollToken: pollTokenSchema }),
    },
    async ({ pollToken }) => {
      try {
        return success(publicPoll(await service.getPublicPoll(pollToken)));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "create_poll",
    {
      description: "Create a scheduling poll. Organizer authorization is required.",
      inputSchema: z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(2000).optional(),
        location: z.string().trim().max(500).optional(),
        timezone: z.string().trim().min(1).max(100),
        durationMinutes: z.number().int().min(1).max(24 * 60),
      }),
    },
    async (input, context) => {
      try {
        const ownerId = await requireOwner(resolveOwner, context.http?.req);
        const created = await service.createPoll({ ownerId, ...input });
        return success({
          publicToken: created.publicToken,
          poll: publicPoll(created.poll),
        });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "add_time_slots",
    {
      description: "Add one or more candidate start times to a poll. Organizer authorization is required.",
      inputSchema: z.object({
        pollToken: pollTokenSchema,
        slots: z.array(slotSchema).min(1).max(100),
      }),
    },
    async ({ pollToken, slots }, context) => {
      try {
        const ownerId = await requireOwner(resolveOwner, context.http?.req);
        let poll = await service.getPublicPoll(pollToken);
        for (const slot of slots) {
          poll = await service.addSlot(pollToken, ownerId, {
            id: slot.id ?? randomUUID(),
            startsAtUtc: slot.startsAtUtc,
          });
        }
        return success(publicPoll(poll));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "remove_time_slot",
    {
      description: "Remove a candidate time and its associated votes. Organizer authorization is required.",
      inputSchema: z.object({ pollToken: pollTokenSchema, slotId: z.string().min(1) }),
    },
    async ({ pollToken, slotId }, context) => {
      try {
        const ownerId = await requireOwner(resolveOwner, context.http?.req);
        return success(publicPoll(await service.removeSlot(pollToken, ownerId, slotId)));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "submit_availability",
    {
      description: "Submit a new participant's Yes/No availability. Omit a slot from votes to leave it unanswered.",
      inputSchema: z.object({
        pollToken: pollTokenSchema,
        displayName: z.string().trim().min(1).max(100),
        votes: votesSchema,
      }),
    },
    async ({ pollToken, displayName, votes }) => {
      try {
        const created = await service.createParticipantResponse(pollToken, {
          displayName,
          votes: votes as Record<string, Vote>,
        });
        return success({
          participantId: created.participantId,
          editToken: created.editToken,
          poll: publicPoll(created.poll),
        });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "update_availability",
    {
      description: "Update one participant's display name and availability using that participant's private edit token.",
      inputSchema: z.object({
        pollToken: pollTokenSchema,
        participantId: z.string().min(1),
        editToken: z.string().min(1),
        displayName: z.string().trim().min(1).max(100),
        votes: votesSchema,
      }),
    },
    async ({ pollToken, participantId, editToken, displayName, votes }) => {
      try {
        return success(
          publicPoll(
            await service.updateParticipantResponse(pollToken, participantId, editToken, {
              displayName,
              votes: votes as Record<string, Vote>,
            }),
          ),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "get_results",
    {
      description: "Read a poll with participant responses and a Yes count for every candidate slot.",
      inputSchema: z.object({ pollToken: pollTokenSchema }),
    },
    async ({ pollToken }) => {
      try {
        return success(resultView(await service.getPublicPoll(pollToken)));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "select_winner",
    {
      description: "Select the winning slot and close the poll. Organizer authorization is required.",
      inputSchema: z.object({ pollToken: pollTokenSchema, slotId: z.string().min(1) }),
    },
    async ({ pollToken, slotId }, context) => {
      try {
        const ownerId = await requireOwner(resolveOwner, context.http?.req);
        return success(publicPoll(await service.selectWinner(pollToken, ownerId, slotId)));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "close_poll",
    {
      description: "Close a poll without selecting a winner. Organizer authorization is required.",
      inputSchema: z.object({ pollToken: pollTokenSchema }),
    },
    async ({ pollToken }, context) => {
      try {
        const ownerId = await requireOwner(resolveOwner, context.http?.req);
        return success(publicPoll(await service.closePoll(pollToken, ownerId)));
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "reopen_poll",
    {
      description: "Reopen a closed poll. Organizer authorization is required.",
      inputSchema: z.object({ pollToken: pollTokenSchema }),
    },
    async ({ pollToken }, context) => {
      try {
        const ownerId = await requireOwner(resolveOwner, context.http?.req);
        return success(publicPoll(await service.reopenPoll(pollToken, ownerId)));
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}

export function createMilloinMcpHandler(
  service: PollService,
  resolveOwner: McpOwnerResolver,
) {
  return createMcpHandler(() => createMilloinMcpServer(service, resolveOwner));
}
