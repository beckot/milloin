import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { InMemoryPollRepository } from "../infrastructure/in-memory-poll-repository";
import { PollService } from "./poll-service";

const sha256 = (value: string) => createHash("sha256").update(value).digest("base64url");

describe("PollService persistence and capabilities", () => {
  it("creates a poll with an unguessable public token and persists it", async () => {
    const repository = new InMemoryPollRepository();
    const service = new PollService(repository);

    const created = await service.createPoll({
      ownerId: "owner-1",
      title: "Sauna",
      timezone: "Europe/Helsinki",
      durationMinutes: 60,
    });

    expect(created.publicToken).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    const stored = await repository.getByPublicToken(created.publicToken);
    expect(stored?.poll.title).toBe("Sauna");
    expect(stored?.poll.id).toBe(created.publicToken);
  });

  it("returns an edit token once but stores only its hash", async () => {
    const repository = new InMemoryPollRepository();
    const service = new PollService(repository);
    const created = await service.createPoll({
      ownerId: "owner-1",
      title: "Sauna",
      timezone: "Europe/Helsinki",
      durationMinutes: 60,
    });

    await service.addSlot(created.publicToken, "owner-1", {
      id: "slot-1",
      startsAtUtc: "2026-08-20T15:00:00.000Z",
    });

    const response = await service.createParticipantResponse(created.publicToken, {
      displayName: "Otto",
      votes: { "slot-1": "YES" },
    });

    expect(response.editToken).toMatch(/^[A-Za-z0-9_-]{30,}$/);
    const stored = await repository.getByPublicToken(created.publicToken);
    expect(stored?.participantEditTokenHashes[response.participantId]).toBe(sha256(response.editToken));
    expect(JSON.stringify(stored)).not.toContain(response.editToken);
  });

  it("edits only with the matching private capability token", async () => {
    const repository = new InMemoryPollRepository();
    const service = new PollService(repository);
    const created = await service.createPoll({
      ownerId: "owner-1",
      title: "Sauna",
      timezone: "Europe/Helsinki",
      durationMinutes: 60,
    });
    await service.addSlot(created.publicToken, "owner-1", {
      id: "slot-1",
      startsAtUtc: "2026-08-20T15:00:00.000Z",
    });
    const participant = await service.createParticipantResponse(created.publicToken, {
      displayName: "Otto",
      votes: { "slot-1": "YES" },
    });

    await expect(
      service.updateParticipantResponse(created.publicToken, participant.participantId, "wrong-token", {
        displayName: "Otto",
        votes: { "slot-1": "NO" },
      }),
    ).rejects.toThrow(/capability|token|author/i);

    await service.updateParticipantResponse(created.publicToken, participant.participantId, participant.editToken, {
      displayName: "Otto B",
      votes: { "slot-1": "NO" },
    });

    const poll = await service.getPublicPoll(created.publicToken);
    expect(poll.participants[0]?.displayName).toBe("Otto B");
    expect(poll.participants[0]?.votes["slot-1"]).toBe("NO");
  });

  it("rejects organizer mutations from a different owner", async () => {
    const repository = new InMemoryPollRepository();
    const service = new PollService(repository);
    const created = await service.createPoll({
      ownerId: "owner-1",
      title: "Sauna",
      timezone: "Europe/Helsinki",
      durationMinutes: 60,
    });

    await expect(
      service.addSlot(created.publicToken, "owner-2", {
        id: "slot-1",
        startsAtUtc: "2026-08-20T15:00:00.000Z",
      }),
    ).rejects.toThrow(/owner|author/i);
  });

  it("deletes the whole poll aggregate", async () => {
    const repository = new InMemoryPollRepository();
    const service = new PollService(repository);
    const created = await service.createPoll({
      ownerId: "owner-1",
      title: "Sauna",
      timezone: "Europe/Helsinki",
      durationMinutes: 60,
    });

    await service.deletePoll(created.publicToken, "owner-1");
    await expect(service.getPublicPoll(created.publicToken)).rejects.toThrow(/not found/i);
  });
});
