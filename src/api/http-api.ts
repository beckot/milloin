import { z, ZodError } from "zod";
import type { PollService } from "../application/poll-service";

export type OwnerAuthenticator = (request: Request) => Promise<string | null>;

const voteSchema = z.enum(["YES", "NO"]);
const votesSchema = z.record(z.string().min(1), voteSchema);
const createPollSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(500).optional(),
  timezone: z.string().trim().min(1).max(100),
  durationMinutes: z.number().int().min(1).max(24 * 60),
});
const slotSchema = z.object({
  id: z.string().min(1).max(100),
  startsAtUtc: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid timestamp"),
});
const participantSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  votes: votesSchema,
});
const winnerSchema = z.object({ slotId: z.string().min(1).max(100) });

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });

const errorResponse = (error: unknown): Response => {
  if (error instanceof ZodError) {
    return json(
      {
        error: "invalid_request",
        message: "Request validation failed",
        details: error.issues,
      },
      400,
    );
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  const lower = message.toLowerCase();
  if (lower.includes("not found")) return json({ error: "not_found", message }, 404);
  if (lower.includes("closed")) return json({ error: "poll_closed", message }, 409);
  if (lower.includes("authorized") || lower.includes("owner")) {
    return json({ error: "forbidden", message }, 403);
  }
  if (
    lower.includes("required") ||
    lower.includes("invalid") ||
    lower.includes("unknown slot") ||
    lower.includes("does not exist")
  ) {
    return json({ error: "invalid_request", message }, 400);
  }
  return json({ error: "conflict", message }, 409);
};

const parseJson = async <T>(request: Request, schema: z.ZodType<T>): Promise<T> => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ZodError([
      {
        code: "custom",
        path: [],
        message: "Request body must be valid JSON",
      },
    ]);
  }
  return schema.parse(body);
};

const bearerToken = (request: Request): string | null => {
  const value = request.headers.get("authorization");
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token || null;
};

const escapeIcs = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replace(/\r?\n/g, "\\n");

const icsTimestamp = (date: Date): string =>
  date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

export class HttpApi {
  constructor(
    private readonly service: PollService,
    private readonly authenticateOwner: OwnerAuthenticator,
  ) {}

  async createPoll(request: Request): Promise<Response> {
    const ownerId = await this.authenticateOwner(request);
    if (!ownerId) return json({ error: "unauthorized", message: "Owner authorization required" }, 401);
    try {
      const input = await parseJson(request, createPollSchema);
      const created = await this.service.createPoll({ ownerId, ...input });
      return json(created, 201);
    } catch (error) {
      return errorResponse(error);
    }
  }

  async getPoll(publicToken: string): Promise<Response> {
    try {
      return json(await this.service.getPublicPoll(publicToken));
    } catch (error) {
      return errorResponse(error);
    }
  }

  async addSlot(request: Request, publicToken: string): Promise<Response> {
    const ownerId = await this.authenticateOwner(request);
    if (!ownerId) return json({ error: "unauthorized", message: "Owner authorization required" }, 401);
    try {
      const slot = await parseJson(request, slotSchema);
      return json(await this.service.addSlot(publicToken, ownerId, slot));
    } catch (error) {
      return errorResponse(error);
    }
  }

  async deleteSlot(request: Request, publicToken: string, slotId: string): Promise<Response> {
    const ownerId = await this.authenticateOwner(request);
    if (!ownerId) return json({ error: "unauthorized", message: "Owner authorization required" }, 401);
    try {
      return json(await this.service.removeSlot(publicToken, ownerId, slotId));
    } catch (error) {
      return errorResponse(error);
    }
  }

  async createParticipant(request: Request, publicToken: string): Promise<Response> {
    try {
      const input = await parseJson(request, participantSchema);
      const created = await this.service.createParticipantResponse(publicToken, input);
      return json(created, 201);
    } catch (error) {
      return errorResponse(error);
    }
  }

  async updateParticipant(request: Request, publicToken: string, participantId: string): Promise<Response> {
    const editToken = bearerToken(request);
    if (!editToken) {
      return json({ error: "unauthorized", message: "Participant edit capability required" }, 401);
    }
    try {
      const input = await parseJson(request, participantSchema);
      return json(await this.service.updateParticipantResponse(publicToken, participantId, editToken, input));
    } catch (error) {
      return errorResponse(error);
    }
  }

  async selectWinner(request: Request, publicToken: string): Promise<Response> {
    const ownerId = await this.authenticateOwner(request);
    if (!ownerId) return json({ error: "unauthorized", message: "Owner authorization required" }, 401);
    try {
      const { slotId } = await parseJson(request, winnerSchema);
      return json(await this.service.selectWinner(publicToken, ownerId, slotId));
    } catch (error) {
      return errorResponse(error);
    }
  }

  async close(request: Request, publicToken: string): Promise<Response> {
    const ownerId = await this.authenticateOwner(request);
    if (!ownerId) return json({ error: "unauthorized", message: "Owner authorization required" }, 401);
    try {
      return json(await this.service.closePoll(publicToken, ownerId));
    } catch (error) {
      return errorResponse(error);
    }
  }

  async reopen(request: Request, publicToken: string): Promise<Response> {
    const ownerId = await this.authenticateOwner(request);
    if (!ownerId) return json({ error: "unauthorized", message: "Owner authorization required" }, 401);
    try {
      return json(await this.service.reopenPoll(publicToken, ownerId));
    } catch (error) {
      return errorResponse(error);
    }
  }

  async deletePoll(request: Request, publicToken: string): Promise<Response> {
    const ownerId = await this.authenticateOwner(request);
    if (!ownerId) return json({ error: "unauthorized", message: "Owner authorization required" }, 401);
    try {
      await this.service.deletePoll(publicToken, ownerId);
      return new Response(null, { status: 204 });
    } catch (error) {
      return errorResponse(error);
    }
  }

  async calendar(publicToken: string): Promise<Response> {
    try {
      const poll = await this.service.getPublicPoll(publicToken);
      if (!poll.winnerSlotId) return json({ error: "no_winner", message: "Poll has no winning slot" }, 409);
      const slot = poll.slots.find((candidate) => candidate.id === poll.winnerSlotId);
      if (!slot) return json({ error: "no_winner", message: "Winning slot no longer exists" }, 409);

      const start = new Date(slot.startsAtUtc);
      const end = new Date(start.getTime() + poll.durationMinutes * 60_000);
      const description = poll.description ? `DESCRIPTION:${escapeIcs(poll.description)}\r\n` : "";
      const location = poll.location ? `LOCATION:${escapeIcs(poll.location)}\r\n` : "";
      const body = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//milloin//scheduling poll//FI",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        `UID:${escapeIcs(`${publicToken}-${slot.id}@milloin`)}`,
        `DTSTAMP:${icsTimestamp(new Date())}`,
        `DTSTART:${icsTimestamp(start)}`,
        `DTEND:${icsTimestamp(end)}`,
        `SUMMARY:${escapeIcs(poll.title)}`,
        description.trimEnd(),
        location.trimEnd(),
        "END:VEVENT",
        "END:VCALENDAR",
        "",
      ]
        .filter(Boolean)
        .join("\r\n");

      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "text/calendar; charset=utf-8",
          "content-disposition": `attachment; filename="milloin-${publicToken}.ics"`,
          "cache-control": "no-store",
        },
      });
    } catch (error) {
      return errorResponse(error);
    }
  }
}
