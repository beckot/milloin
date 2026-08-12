import { describe, expect, it } from "vitest";
import { PollService } from "../application/poll-service";
import { InMemoryPollRepository } from "../infrastructure/in-memory-poll-repository";
import { HttpApi } from "./http-api";

const jsonRequest = (url: string, method: string, body?: unknown, headers?: Record<string, string>) =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const makeApi = () =>
  new HttpApi(
    new PollService(new InMemoryPollRepository()),
    async (request) => (request.headers.get("authorization") === "Bearer owner-secret" ? "owner-1" : null),
  );

describe("canonical HTTP API", () => {
  it("runs the scheduling lifecycle without a browser", async () => {
    const api = makeApi();

    const create = await api.createPoll(
      jsonRequest(
        "http://test/api/v1/polls",
        "POST",
        { title: "Sauna", timezone: "Europe/Helsinki", durationMinutes: 60 },
        { authorization: "Bearer owner-secret" },
      ),
    );
    expect(create.status).toBe(201);
    const created = await create.json();
    const publicToken = created.publicToken as string;
    expect(publicToken).toBeTruthy();

    const addSlot1 = await api.addSlot(
      jsonRequest(
        `http://test/api/v1/polls/${publicToken}/slots`,
        "POST",
        { id: "slot-1", startsAtUtc: "2026-08-20T15:00:00.000Z" },
        { authorization: "Bearer owner-secret" },
      ),
      publicToken,
    );
    expect(addSlot1.status).toBe(200);

    const addSlot2 = await api.addSlot(
      jsonRequest(
        `http://test/api/v1/polls/${publicToken}/slots`,
        "POST",
        { id: "slot-2", startsAtUtc: "2026-08-21T15:00:00.000Z" },
        { authorization: "Bearer owner-secret" },
      ),
      publicToken,
    );
    expect(addSlot2.status).toBe(200);

    const publicPoll = await api.getPoll(publicToken);
    expect(publicPoll.status).toBe(200);
    expect((await publicPoll.json()).slots).toHaveLength(2);

    const participant = await api.createParticipant(
      jsonRequest(`http://test/api/v1/polls/${publicToken}/participants`, "POST", {
        displayName: "Anna",
        votes: { "slot-1": "YES", "slot-2": "NO" },
      }),
      publicToken,
    );
    expect(participant.status).toBe(201);
    const participantBody = await participant.json();
    expect(participantBody.editToken).toBeTruthy();

    const edit = await api.updateParticipant(
      jsonRequest(
        `http://test/api/v1/polls/${publicToken}/participants/${participantBody.participantId}`,
        "PUT",
        { displayName: "Anna", votes: { "slot-1": "YES", "slot-2": "YES" } },
        { authorization: `Bearer ${participantBody.editToken}` },
      ),
      publicToken,
      participantBody.participantId,
    );
    expect(edit.status).toBe(200);

    const winner = await api.selectWinner(
      jsonRequest(
        `http://test/api/v1/polls/${publicToken}/winner`,
        "POST",
        { slotId: "slot-2" },
        { authorization: "Bearer owner-secret" },
      ),
      publicToken,
    );
    expect(winner.status).toBe(200);
    expect((await winner.json()).status).toBe("CLOSED");

    const closedWrite = await api.createParticipant(
      jsonRequest(`http://test/api/v1/polls/${publicToken}/participants`, "POST", {
        displayName: "Mikko",
        votes: { "slot-2": "YES" },
      }),
      publicToken,
    );
    expect(closedWrite.status).toBe(409);

    const ics = await api.calendar(publicToken);
    expect(ics.status).toBe(200);
    expect(ics.headers.get("content-type")).toContain("text/calendar");
    const icsText = await ics.text();
    expect(icsText).toContain("BEGIN:VCALENDAR");
    expect(icsText).toContain("SUMMARY:Sauna");
  });

  it("rejects owner operations without owner authorization", async () => {
    const api = makeApi();
    const response = await api.createPoll(
      jsonRequest("http://test/api/v1/polls", "POST", {
        title: "Sauna",
        timezone: "Europe/Helsinki",
        durationMinutes: 60,
      }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects malformed input with a 400 response", async () => {
    const api = makeApi();
    const response = await api.createPoll(
      jsonRequest(
        "http://test/api/v1/polls",
        "POST",
        { title: "", timezone: "", durationMinutes: -1 },
        { authorization: "Bearer owner-secret" },
      ),
    );
    expect(response.status).toBe(400);
  });
});
