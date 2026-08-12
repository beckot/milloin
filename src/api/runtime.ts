import { PollService } from "../application/poll-service";
import { authConfig } from "../auth/config";
import { ownerAuthenticator } from "../auth/session";
import { FirestorePollRepository } from "../infrastructure/firestore-poll-repository";
import { InMemoryPollRepository } from "../infrastructure/in-memory-poll-repository";
import { HttpApi, type OwnerAuthenticator } from "./http-api";

let runtimeApi: HttpApi | undefined;
let runtimeService: PollService | undefined;
let runtimeAuthenticator: OwnerAuthenticator | undefined;
const memoryRepository = new InMemoryPollRepository();

export function getPollService(): PollService {
  if (!runtimeService) {
    const repository =
      process.env.MILLOIN_STORAGE === "memory" ? memoryRepository : new FirestorePollRepository();
    runtimeService = new PollService(repository);
  }
  return runtimeService;
}

export function getOwnerAuthenticator(): OwnerAuthenticator {
  if (!runtimeAuthenticator) {
    const config = authConfig();
    runtimeAuthenticator = ownerAuthenticator({
      sessionSecret: config.sessionSecret,
      ownerEmail: config.ownerEmail,
      ownerApiKey: config.ownerApiKey,
    });
  }
  return runtimeAuthenticator;
}

export function getHttpApi(): HttpApi {
  if (!runtimeApi) runtimeApi = new HttpApi(getPollService(), getOwnerAuthenticator());
  return runtimeApi;
}
