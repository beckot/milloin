import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  addSlot,
  closePoll,
  createPoll,
  deleteSlot,
  reopenPoll,
  selectWinner,
  submitAvailability,
  type CreatePollInput,
  type Poll,
  type Slot,
  type Vote,
} from "../domain/poll";
import type { PollAggregate, PollRepository } from "./poll-repository";

const token = (bytes: number) => randomBytes(bytes).toString("base64url");
const hashToken = (value: string) => createHash("sha256").update(value).digest("base64url");

const secureTokenMatches = (plainTextToken: string, expectedHash: string): boolean => {
  const actual = Buffer.from(hashToken(plainTextToken));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export type CreateParticipantInput = {
  displayName: string;
  votes: Record<string, Vote>;
};

export class PollService {
  constructor(private readonly repository: PollRepository) {}

  async createPoll(input: Omit<CreatePollInput, "id">): Promise<{ poll: Poll; publicToken: string }> {
    const publicToken = token(24);
    const poll = createPoll({ ...input, id: publicToken });
    await this.repository.create(publicToken, {
      poll,
      participantEditTokenHashes: {},
    });
    return { poll, publicToken };
  }

  async getPublicPoll(publicToken: string): Promise<Poll> {
    return (await this.requireAggregate(publicToken)).poll;
  }

  async addSlot(publicToken: string, ownerId: string, slot: Slot): Promise<Poll> {
    const aggregate = await this.requireOwner(publicToken, ownerId);
    aggregate.poll = addSlot(aggregate.poll, slot);
    await this.repository.save(publicToken, aggregate);
    return aggregate.poll;
  }

  async removeSlot(publicToken: string, ownerId: string, slotId: string): Promise<Poll> {
    const aggregate = await this.requireOwner(publicToken, ownerId);
    aggregate.poll = deleteSlot(aggregate.poll, slotId);
    await this.repository.save(publicToken, aggregate);
    return aggregate.poll;
  }

  async createParticipantResponse(
    publicToken: string,
    input: CreateParticipantInput,
  ): Promise<{ participantId: string; editToken: string; poll: Poll }> {
    const aggregate = await this.requireAggregate(publicToken);
    const participantId = randomUUID();
    const editToken = token(32);

    aggregate.poll = submitAvailability(aggregate.poll, {
      participantId,
      displayName: input.displayName,
      votes: input.votes,
    });
    aggregate.participantEditTokenHashes[participantId] = hashToken(editToken);
    await this.repository.save(publicToken, aggregate);

    return { participantId, editToken, poll: aggregate.poll };
  }

  async updateParticipantResponse(
    publicToken: string,
    participantId: string,
    editToken: string,
    input: CreateParticipantInput,
  ): Promise<Poll> {
    const aggregate = await this.requireAggregate(publicToken);
    const expectedHash = aggregate.participantEditTokenHashes[participantId];
    if (!expectedHash || !secureTokenMatches(editToken, expectedHash)) {
      throw new Error("Participant capability token is not authorized");
    }

    aggregate.poll = submitAvailability(aggregate.poll, {
      participantId,
      displayName: input.displayName,
      votes: input.votes,
    });
    await this.repository.save(publicToken, aggregate);
    return aggregate.poll;
  }

  async selectWinner(publicToken: string, ownerId: string, slotId: string): Promise<Poll> {
    const aggregate = await this.requireOwner(publicToken, ownerId);
    aggregate.poll = selectWinner(aggregate.poll, slotId);
    await this.repository.save(publicToken, aggregate);
    return aggregate.poll;
  }

  async closePoll(publicToken: string, ownerId: string): Promise<Poll> {
    const aggregate = await this.requireOwner(publicToken, ownerId);
    aggregate.poll = closePoll(aggregate.poll);
    await this.repository.save(publicToken, aggregate);
    return aggregate.poll;
  }

  async reopenPoll(publicToken: string, ownerId: string): Promise<Poll> {
    const aggregate = await this.requireOwner(publicToken, ownerId);
    aggregate.poll = reopenPoll(aggregate.poll);
    await this.repository.save(publicToken, aggregate);
    return aggregate.poll;
  }

  async deletePoll(publicToken: string, ownerId: string): Promise<void> {
    await this.requireOwner(publicToken, ownerId);
    await this.repository.delete(publicToken);
  }

  private async requireAggregate(publicToken: string): Promise<PollAggregate> {
    const aggregate = await this.repository.getByPublicToken(publicToken);
    if (!aggregate) throw new Error("Poll not found");
    return aggregate;
  }

  private async requireOwner(publicToken: string, ownerId: string): Promise<PollAggregate> {
    const aggregate = await this.requireAggregate(publicToken);
    if (aggregate.poll.ownerId !== ownerId) throw new Error("Owner is not authorized for this poll");
    return aggregate;
  }
}
