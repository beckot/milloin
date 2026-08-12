import { describe, expect, it } from "vitest";
import {
  addSlot,
  closePoll,
  createPoll,
  deleteSlot,
  reopenPoll,
  selectWinner,
  submitAvailability,
  type Poll,
} from "./poll";

const makePoll = (): Poll =>
  createPoll({
    ownerId: "owner-1",
    title: "Sauna",
    timezone: "Europe/Helsinki",
    durationMinutes: 60,
  });

describe("poll domain", () => {
  it("creates an open poll with yes/no/unanswered semantics", () => {
    const poll = makePoll();
    expect(poll.status).toBe("OPEN");
    expect(poll.slots).toEqual([]);
    expect(poll.participants).toEqual([]);
  });

  it("adds slots and treats missing votes as unanswered", () => {
    let poll = makePoll();
    poll = addSlot(poll, { id: "slot-1", startsAtUtc: "2026-08-20T15:00:00.000Z" });
    poll = submitAvailability(poll, {
      participantId: "p1",
      displayName: "Otto",
      votes: { "slot-1": "YES" },
    });
    poll = addSlot(poll, { id: "slot-2", startsAtUtc: "2026-08-21T15:00:00.000Z" });

    expect(poll.participants[0]?.votes["slot-1"]).toBe("YES");
    expect(poll.participants[0]?.votes["slot-2"]).toBeUndefined();
  });

  it("supports explicit NO without inventing MAYBE", () => {
    let poll = addSlot(makePoll(), {
      id: "slot-1",
      startsAtUtc: "2026-08-20T15:00:00.000Z",
    });
    poll = submitAvailability(poll, {
      participantId: "p1",
      displayName: "Otto",
      votes: { "slot-1": "NO" },
    });

    expect(poll.participants[0]?.votes["slot-1"]).toBe("NO");
  });

  it("deleting a slot deletes votes associated with it", () => {
    let poll = addSlot(makePoll(), {
      id: "slot-1",
      startsAtUtc: "2026-08-20T15:00:00.000Z",
    });
    poll = submitAvailability(poll, {
      participantId: "p1",
      displayName: "Otto",
      votes: { "slot-1": "YES" },
    });
    poll = deleteSlot(poll, "slot-1");

    expect(poll.slots).toEqual([]);
    expect(poll.participants[0]?.votes["slot-1"]).toBeUndefined();
  });

  it("selecting a winner closes the poll and reopening restores writes", () => {
    let poll = addSlot(makePoll(), {
      id: "slot-1",
      startsAtUtc: "2026-08-20T15:00:00.000Z",
    });
    poll = selectWinner(poll, "slot-1");
    expect(poll.status).toBe("CLOSED");
    expect(poll.winnerSlotId).toBe("slot-1");

    expect(() =>
      submitAvailability(poll, {
        participantId: "p1",
        displayName: "Otto",
        votes: { "slot-1": "YES" },
      }),
    ).toThrow(/closed/i);

    poll = reopenPoll(poll);
    expect(poll.status).toBe("OPEN");
    expect(() =>
      submitAvailability(poll, {
        participantId: "p1",
        displayName: "Otto",
        votes: { "slot-1": "YES" },
      }),
    ).not.toThrow();
  });

  it("rejects a winner that is not one of the poll slots", () => {
    expect(() => selectWinner(makePoll(), "missing")).toThrow(/slot/i);
  });

  it("can close explicitly", () => {
    const poll = closePoll(makePoll());
    expect(poll.status).toBe("CLOSED");
  });
});
