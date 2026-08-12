import { z, ZodError } from "zod";
import type { PollService } from "../application/poll-service";
import { yesCount, type Poll } from "../domain/poll";

export type OwnerAuthenticator = (request: Request) => Promise<string | null>;

const isTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
};

const timeZoneSchema = z.string().trim().min(1).max(100).refine(isTimeZone, "Invalid IANA timezone");
const voteSchema = z.enum(["YES", "NO"]);
const votesSchema = z.record(z.string().min(1), voteSchema);
const createPollSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(500).optional(),
  timezone: timeZoneSchema,
  durationMinutes: z.number().int().min(1).max(24 * 60),
});
const updatePollSchema = createPollSchema.partial().refine((value) => Object.keys(value).length > 0, "At least one field is required");
const slotSchema = z.object({
  id: z.string().min(1).max(100),
  startsAtUtc: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid timestamp"),
});
const participantSchema = z.object({ displayName: z.string().trim().min(1).max(100), votes: votesSchema });
const winnerSchema = z.object({ slotId: z.string().min(1).max(100) });

const publicPoll = (poll: Poll) => {
  const { ownerId: _ownerId, ...safe } = poll;
  return safe;
};

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

const errorResponse = (error: unknown): Response => {
  if (error instanceof ZodError) return json({ error: "invalid_request", message: "Request validation failed", details: error.issues }, 400);
  const message = error instanceof Error ? error.message : "Unexpected error";
  const lower = message.toLowerCase();
  if (lower.includes("not found")) return json({ error: "not_found", message }, 404);
  if (lower.includes("closed")) return json({ error: "poll_closed", message }, 409);
  if (lower.includes("authorized") || lower.includes("owner")) return json({ error: "forbidden", message }, 403);
  if (lower.includes("required") || lower.includes("invalid") || lower.includes("unknown slot") || lower.includes("does not exist")) return json({ error: "invalid_request", message }, 400);
  return json({ error: "conflict", message }, 409);
};

const parseJson = async <T>(request: Request, schema: z.ZodType<T>): Promise<T> => {
  try {
    return schema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) throw error;
    throw new ZodError([{ code: "custom", path: [], message: "Request body must be valid JSON" }]);
  }
};

const bearerToken = (request: Request): string | null => {
  const value = request.headers.get("authorization");
  if (!value?.startsWith("Bearer ")) return null;
  return value.slice(7).trim() || null;
};

const escapeIcs = (value: string): string => value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replace(/\r?\n/g, "\\n");
const icsTimestamp = (date: Date): string => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

export class HttpApi {
  constructor(private readonly service: PollService, private readonly authenticateOwner: OwnerAuthenticator) {}

  private async owner(request: Request): Promise<string | Response> {
    return (await this.authenticateOwner(request)) ?? json({ error: "unauthorized", message: "Owner authorization required" }, 401);
  }

  async createPoll(request: Request): Promise<Response> {
    const owner = await this.owner(request); if (owner instanceof Response) return owner;
    try { const created = await this.service.createPoll({ ownerId: owner, ...(await parseJson(request, createPollSchema)) }); return json({ ...created, poll: publicPoll(created.poll) }, 201); } catch (error) { return errorResponse(error); }
  }

  async getPoll(publicToken: string): Promise<Response> {
    try { return json(publicPoll(await this.service.getPublicPoll(publicToken))); } catch (error) { return errorResponse(error); }
  }

  async updatePoll(request: Request, publicToken: string): Promise<Response> {
    const owner = await this.owner(request); if (owner instanceof Response) return owner;
    try { return json(publicPoll(await this.service.updatePoll(publicToken, owner, await parseJson(request, updatePollSchema)))); } catch (error) { return errorResponse(error); }
  }

  async results(publicToken: string): Promise<Response> {
    try {
      const poll = await this.service.getPublicPoll(publicToken);
      return json({ poll: publicPoll(poll), slots: poll.slots.map((slot) => ({ slotId: slot.id, yesCount: yesCount(poll, slot.id), totalResponses: poll.participants.length })) });
    } catch (error) { return errorResponse(error); }
  }

  async addSlot(request: Request, publicToken: string): Promise<Response> {
    const owner = await this.owner(request); if (owner instanceof Response) return owner;
    try { return json(publicPoll(await this.service.addSlot(publicToken, owner, await parseJson(request, slotSchema)))); } catch (error) { return errorResponse(error); }
  }

  async deleteSlot(request: Request, publicToken: string, slotId: string): Promise<Response> {
    const owner = await this.owner(request); if (owner instanceof Response) return owner;
    try { return json(publicPoll(await this.service.removeSlot(publicToken, owner, slotId))); } catch (error) { return errorResponse(error); }
  }

  async createParticipant(request: Request, publicToken: string): Promise<Response> {
    try {
      const created = await this.service.createParticipantResponse(publicToken, await parseJson(request, participantSchema));
      return json({ participantId: created.participantId, editToken: created.editToken, poll: publicPoll(created.poll) }, 201);
    } catch (error) { return errorResponse(error); }
  }

  async updateParticipant(request: Request, publicToken: string, participantId: string): Promise<Response> {
    const editToken = bearerToken(request);
    if (!editToken) return json({ error: "unauthorized", message: "Participant edit capability required" }, 401);
    try { return json(publicPoll(await this.service.updateParticipantResponse(publicToken, participantId, editToken, await parseJson(request, participantSchema)))); } catch (error) { return errorResponse(error); }
  }

  async selectWinner(request: Request, publicToken: string): Promise<Response> {
    const owner = await this.owner(request); if (owner instanceof Response) return owner;
    try { const { slotId } = await parseJson(request, winnerSchema); return json(publicPoll(await this.service.selectWinner(publicToken, owner, slotId))); } catch (error) { return errorResponse(error); }
  }

  async close(request: Request, publicToken: string): Promise<Response> {
    const owner = await this.owner(request); if (owner instanceof Response) return owner;
    try { return json(publicPoll(await this.service.closePoll(publicToken, owner))); } catch (error) { return errorResponse(error); }
  }

  async reopen(request: Request, publicToken: string): Promise<Response> {
    const owner = await this.owner(request); if (owner instanceof Response) return owner;
    try { return json(publicPoll(await this.service.reopenPoll(publicToken, owner))); } catch (error) { return errorResponse(error); }
  }

  async deletePoll(request: Request, publicToken: string): Promise<Response> {
    const owner = await this.owner(request); if (owner instanceof Response) return owner;
    try { await this.service.deletePoll(publicToken, owner); return new Response(null, { status: 204 }); } catch (error) { return errorResponse(error); }
  }

  async calendar(publicToken: string): Promise<Response> {
    try {
      const poll = await this.service.getPublicPoll(publicToken);
      if (!poll.winnerSlotId) return json({ error: "no_winner", message: "Poll has no winning slot" }, 409);
      const slot = poll.slots.find((candidate) => candidate.id === poll.winnerSlotId);
      if (!slot) return json({ error: "no_winner", message: "Winning slot no longer exists" }, 409);
      const start = new Date(slot.startsAtUtc); const end = new Date(start.getTime() + poll.durationMinutes * 60_000);
      const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//milloin//scheduling poll//FI", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", `UID:${escapeIcs(`${publicToken}-${slot.id}@milloin`)}`, `DTSTAMP:${icsTimestamp(new Date())}`, `DTSTART:${icsTimestamp(start)}`, `DTEND:${icsTimestamp(end)}`, `SUMMARY:${escapeIcs(poll.title)}`, poll.description ? `DESCRIPTION:${escapeIcs(poll.description)}` : "", poll.location ? `LOCATION:${escapeIcs(poll.location)}` : "", "END:VEVENT", "END:VCALENDAR", ""].filter(Boolean).join("\r\n");
      return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="milloin-${publicToken}.ics"`, "cache-control": "no-store" } });
    } catch (error) { return errorResponse(error); }
  }
}
