import { PollService } from "../application/poll-service";
import { authConfig } from "../auth/config";
import { ownerAuthenticator } from "../auth/session";
import { FirestorePollRepository } from "../infrastructure/firestore-poll-repository";
import { InMemoryPollRepository } from "../infrastructure/in-memory-poll-repository";
import { HttpApi } from "./http-api";

let runtimeApi: HttpApi | undefined;
const memoryRepository = new InMemoryPollRepository();

export function getHttpApi(): HttpApi {
  if (!runtimeApi) {
    const config = authConfig();
    const repository = process.env.MILLOIN_STORAGE === "memory" ? memoryRepository : new FirestorePollRepository();
    runtimeApi = new HttpApi(
      new PollService(repository),
      ownerAuthenticator({ sessionSecret: config.sessionSecret, ownerEmail: config.ownerEmail, ownerApiKey: config.ownerApiKey }),
    );
  }
  return runtimeApi;
}
