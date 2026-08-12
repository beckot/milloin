import { PollService } from "../application/poll-service";
import { authConfig } from "../auth/config";
import { ownerAuthenticator } from "../auth/session";
import { FirestorePollRepository } from "../infrastructure/firestore-poll-repository";
import { HttpApi } from "./http-api";

let runtimeApi: HttpApi | undefined;

export function getHttpApi(): HttpApi {
  if (!runtimeApi) {
    const config = authConfig();
    runtimeApi = new HttpApi(
      new PollService(new FirestorePollRepository()),
      ownerAuthenticator({
        sessionSecret: config.sessionSecret,
        ownerEmail: config.ownerEmail,
        ownerApiKey: config.ownerApiKey,
      }),
    );
  }
  return runtimeApi;
}
