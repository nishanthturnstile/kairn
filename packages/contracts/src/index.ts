import createClient, { type Client, type ClientOptions } from "openapi-fetch";
import type { paths } from "./generated/api.js";

export type { components, paths } from "./generated/api.js";

export function createApiClient(options?: ClientOptions): Client<paths> {
  return createClient<paths>(options);
}
