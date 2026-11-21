import { authOrigin } from "../auth";
import { captureInvitationToken } from "../invitation-handoff";
import { invitationLink, invitationPath } from "../invitation-link";

let capturedInitial = false;

export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}) {
  const incoming = invitationLink(path, authOrigin, __DEV__);
  if (!incoming) return path;
  if (incoming.token && (!initial || !capturedInitial)) {
    if (initial) capturedInitial = true;
    captureInvitationToken(incoming.token);
  }
  return invitationPath;
}
