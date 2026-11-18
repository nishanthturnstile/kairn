import { createApiClient } from "@kairn/contracts";

export function createMobileApiClient(baseUrl: string) {
  return createApiClient({ baseUrl });
}
