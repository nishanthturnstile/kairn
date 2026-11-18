import { serve } from "@hono/node-server";
import {
  checkDatabaseReadiness,
  createAuth,
  openDatabase,
  parseServerEnvironment,
} from "@kairn/backend";
import { createApp } from "./app.js";
import { loadReader } from "./reader.js";

const {
  HOST,
  PORT,
  DATABASE_URL,
  BETTER_AUTH_URL,
  BETTER_AUTH_SECRET,
  READER_BUILD_DIR,
} = parseServerEnvironment(process.env);
const { db } = openDatabase(DATABASE_URL);
const reader = READER_BUILD_DIR
  ? await loadReader(READER_BUILD_DIR)
  : undefined;
const auth = createAuth(db, {
  baseURL: BETTER_AUTH_URL,
  secret: BETTER_AUTH_SECRET,
});
const app = createApp({
  authHandler: auth.handler,
  checkReadiness: () => checkDatabaseReadiness(db),
  renderUnavailableReader: reader && (() => reader(null)),
});
serve({ fetch: app.fetch, hostname: HOST, port: PORT }, ({ port }) => {
  console.log(`Kairn server listening on ${HOST}:${port}`);
});
