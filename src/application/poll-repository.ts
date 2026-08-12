import type { Poll } from "../domain/poll";

export type PollAggregate = {
  poll: Poll;
  participantEditTokenHashes: Record<string, string>;
};

export type PollUpdater = (aggregate: PollAggregate) => PollAggregate;

export interface PollRepository {
  create(publicToken: string, aggregate: PollAggregate): Promise<void>;
  getByPublicToken(publicToken: string): Promise<PollAggregate | null>;
  update(publicToken: string, updater: PollUpdater): Promise<PollAggregate>;
  delete(publicToken: string): Promise<void>;
}
