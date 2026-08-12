import { Firestore, type DocumentData } from "@google-cloud/firestore";
import type {
  PollAggregate,
  PollRepository,
  PollUpdater,
} from "../application/poll-repository";

const COLLECTION = "polls";

export function createFirestore(): Firestore {
  return new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || undefined,
    ignoreUndefinedProperties: true,
  });
}

export class FirestorePollRepository implements PollRepository {
  constructor(private readonly firestore: Firestore = createFirestore()) {}

  async create(publicToken: string, aggregate: PollAggregate): Promise<void> {
    await this.firestore.collection(COLLECTION).doc(publicToken).create(aggregate as unknown as DocumentData);
  }

  async getByPublicToken(publicToken: string): Promise<PollAggregate | null> {
    const snapshot = await this.firestore.collection(COLLECTION).doc(publicToken).get();
    return snapshot.exists ? (snapshot.data() as PollAggregate) : null;
  }

  async update(publicToken: string, updater: PollUpdater): Promise<PollAggregate> {
    const document = this.firestore.collection(COLLECTION).doc(publicToken);
    return this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(document);
      if (!snapshot.exists) throw new Error("Poll not found");
      const current = snapshot.data() as PollAggregate;
      const updated = updater(structuredClone(current));
      transaction.set(document, updated as unknown as DocumentData);
      return updated;
    });
  }

  async delete(publicToken: string): Promise<void> {
    await this.firestore.collection(COLLECTION).doc(publicToken).delete();
  }
}
