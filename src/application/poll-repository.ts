import type { Poll } from "../domain/poll";

export type PollAggregate = {
  poll: Poll;
  participantEditTokenHashes: Record<string, string>;
};

export interface PollRepository {
  create(publicToken: string, aggregate: PollAggregate): Promise<void>;
  getByPublicToken(publicToken: string): Promise<PollAggregate | null>;
  save(publicToken: string, aggregate: PollAggregate): Promise<void>;
  delete(publicToken: string): Promise<void>;
}
