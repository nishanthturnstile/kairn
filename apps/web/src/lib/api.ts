import { createApiClient } from "@kairn/contracts";

export function createWebApiClient() {
  return createApiClient({ credentials: "same-origin" });
}
