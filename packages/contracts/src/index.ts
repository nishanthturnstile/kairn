import createClient, { type Client, type ClientOptions } from "openapi-fetch";
import type { paths } from "./generated/api.js";

export type { components, paths } from "./generated/api.js";
export type { ReaderStory } from "./reader.js";

export function createApiClient(options?: ClientOptions): Client<paths> {
  return createClient<paths>(options);
}
export type { IdentityDevices, RestrictionConfirmation } from "./identity.js";
