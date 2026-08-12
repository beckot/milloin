import { getOwnerAuthenticator, getPollService } from "../api/runtime";
import { createMilloinMcpHandler } from "./server";

let runtimeHandler: ReturnType<typeof createMilloinMcpHandler> | undefined;

export function getMcpHandler() {
  if (!runtimeHandler) {
    runtimeHandler = createMilloinMcpHandler(getPollService(), async (request) => {
      if (!request) return null;
      return getOwnerAuthenticator()(request);
    });
  }
  return runtimeHandler;
}
