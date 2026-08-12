import { timingSafeEqual } from "node:crypto";
import { PollService } from "../application/poll-service";
import { FirestorePollRepository } from "../infrastructure/firestore-poll-repository";
import { HttpApi, type OwnerAuthenticator } from "./http-api";

let runtimeApi: HttpApi | undefined;

const safeEqual = (left: string, right: string): boolean => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

export const ownerApiKeyAuthenticator: OwnerAuthenticator = async (request) => {
  const expected = process.env.MILLOIN_OWNER_API_KEY;
  if (!expected) return null;
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const supplied = header.slice("Bearer ".length).trim();
  if (!supplied || !safeEqual(supplied, expected)) return null;
  return process.env.MILLOIN_OWNER_ID || "owner";
};

export function getHttpApi(): HttpApi {
  if (!runtimeApi) {
    runtimeApi = new HttpApi(
      new PollService(new FirestorePollRepository()),
      ownerApiKeyAuthenticator,
    );
  }
  return runtimeApi;
}
