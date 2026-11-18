import { serve } from "@hono/node-server";
import {
  checkDatabaseReadiness,
  createAuth,
  openDatabase,
  parseServerEnvironment,
} from "@kairn/backend";
import { createApp } from "./app.js";

const { HOST, PORT, DATABASE_URL, BETTER_AUTH_URL, BETTER_AUTH_SECRET } =
  parseServerEnvironment(process.env);
const { db } = openDatabase(DATABASE_URL);
const auth = createAuth(db, {
  baseURL: BETTER_AUTH_URL,
  secret: BETTER_AUTH_SECRET,
});
const app = createApp({
  authHandler: auth.handler,
  checkReadiness: () => checkDatabaseReadiness(db),
});
serve({ fetch: app.fetch, hostname: HOST, port: PORT }, ({ port }) => {
  console.log(`Kairn server listening on ${HOST}:${port}`);
});
