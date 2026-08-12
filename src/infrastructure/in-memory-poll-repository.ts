import type {
  PollAggregate,
  PollRepository,
  PollUpdater,
} from "../application/poll-repository";

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryPollRepository implements PollRepository {
  private readonly items = new Map<string, PollAggregate>();

  async create(publicToken: string, aggregate: PollAggregate): Promise<void> {
    if (this.items.has(publicToken)) throw new Error("Poll already exists");
    this.items.set(publicToken, clone(aggregate));
  }

  async getByPublicToken(publicToken: string): Promise<PollAggregate | null> {
    const aggregate = this.items.get(publicToken);
    return aggregate ? clone(aggregate) : null;
  }

  async update(publicToken: string, updater: PollUpdater): Promise<PollAggregate> {
    const current = this.items.get(publicToken);
    if (!current) throw new Error("Poll not found");
    const updated = updater(clone(current));
    this.items.set(publicToken, clone(updated));
    return clone(updated);
  }

  async delete(publicToken: string): Promise<void> {
    this.items.delete(publicToken);
  }
}
