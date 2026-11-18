import { serve } from "@hono/node-server";
import { parseServerEnvironment } from "@kairn/backend";
import { app } from "./app.js";

const { HOST, PORT } = parseServerEnvironment(process.env);
serve({ fetch: app.fetch, hostname: HOST, port: PORT }, ({ port }) => {
  console.log(`Kairn server listening on ${HOST}:${port}`);
});
