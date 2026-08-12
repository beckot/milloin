export type PollStatus = "OPEN" | "CLOSED";
export type Vote = "YES" | "NO";

export type Slot = {
  id: string;
  startsAtUtc: string;
};

export type Participant = {
  id: string;
  displayName: string;
  votes: Record<string, Vote>;
};

export type Poll = {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  location?: string;
  timezone: string;
  durationMinutes: number;
  status: PollStatus;
  winnerSlotId?: string;
  slots: Slot[];
  participants: Participant[];
};

export type CreatePollInput = Pick<Poll, "ownerId" | "title" | "timezone" | "durationMinutes"> &
  Partial<Pick<Poll, "description" | "location">> & { id?: string };

export type UpdatePollInput = Partial<
  Pick<Poll, "title" | "description" | "location" | "timezone" | "durationMinutes">
>;

export function createPoll(input: CreatePollInput): Poll {
  if (!input.title.trim()) throw new Error("Poll title is required");
  if (!input.timezone.trim()) throw new Error("Poll timezone is required");
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) {
    throw new Error("Duration must be a positive whole number of minutes");
  }

  return {
    id: input.id ?? crypto.randomUUID(),
    ownerId: input.ownerId,
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    location: input.location?.trim() || undefined,
    timezone: input.timezone.trim(),
    durationMinutes: input.durationMinutes,
    status: "OPEN",
    slots: [],
    participants: [],
  };
}

export function updatePoll(poll: Poll, input: UpdatePollInput): Poll {
  const title = input.title === undefined ? poll.title : input.title.trim();
  const timezone = input.timezone === undefined ? poll.timezone : input.timezone.trim();
  const durationMinutes = input.durationMinutes ?? poll.durationMinutes;

  if (!title) throw new Error("Poll title is required");
  if (!timezone) throw new Error("Poll timezone is required");
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    throw new Error("Duration must be a positive whole number of minutes");
  }

  return {
    ...poll,
    title,
    timezone,
    durationMinutes,
    description:
      input.description === undefined ? poll.description : input.description.trim() || undefined,
    location: input.location === undefined ? poll.location : input.location.trim() || undefined,
  };
}

export function addSlot(poll: Poll, slot: Slot): Poll {
  if (poll.slots.some((candidate) => candidate.id === slot.id)) {
    throw new Error(`Slot ${slot.id} already exists`);
  }
  if (Number.isNaN(Date.parse(slot.startsAtUtc))) {
    throw new Error("Slot start must be a valid timestamp");
  }
  return { ...poll, slots: [...poll.slots, slot] };
}

export function deleteSlot(poll: Poll, slotId: string): Poll {
  if (!poll.slots.some((slot) => slot.id === slotId)) {
    throw new Error(`Slot ${slotId} does not exist`);
  }

  return {
    ...poll,
    winnerSlotId: poll.winnerSlotId === slotId ? undefined : poll.winnerSlotId,
    slots: poll.slots.filter((slot) => slot.id !== slotId),
    participants: poll.participants.map((participant) => {
      const { [slotId]: _removed, ...votes } = participant.votes;
      return { ...participant, votes };
    }),
  };
}

export type SubmitAvailabilityInput = {
  participantId: string;
  displayName: string;
  votes: Record<string, Vote>;
};

export function submitAvailability(poll: Poll, input: SubmitAvailabilityInput): Poll {
  if (poll.status === "CLOSED") throw new Error("Poll is closed");
  if (!input.displayName.trim()) throw new Error("Display name is required");

  for (const [slotId, vote] of Object.entries(input.votes)) {
    if (!poll.slots.some((slot) => slot.id === slotId)) {
      throw new Error(`Vote references unknown slot ${slotId}`);
    }
    if (vote !== "YES" && vote !== "NO") throw new Error("Vote must be YES or NO");
  }

  const participant: Participant = {
    id: input.participantId,
    displayName: input.displayName.trim(),
    votes: { ...input.votes },
  };
  const existing = poll.participants.findIndex((candidate) => candidate.id === input.participantId);

  return {
    ...poll,
    participants:
      existing === -1
        ? [...poll.participants, participant]
        : poll.participants.map((candidate, index) => (index === existing ? participant : candidate)),
  };
}

export function selectWinner(poll: Poll, slotId: string): Poll {
  if (!poll.slots.some((slot) => slot.id === slotId)) {
    throw new Error(`Winner slot ${slotId} does not exist in this poll`);
  }
  return { ...poll, winnerSlotId: slotId, status: "CLOSED" };
}

export function closePoll(poll: Poll): Poll {
  return { ...poll, status: "CLOSED" };
}

export function reopenPoll(poll: Poll): Poll {
  return { ...poll, status: "OPEN" };
}

export function yesCount(poll: Poll, slotId: string): number {
  return poll.participants.reduce(
    (count, participant) => count + (participant.votes[slotId] === "YES" ? 1 : 0),
    0,
  );
}
