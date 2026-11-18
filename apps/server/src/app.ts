import { Hono } from "hono";

export const app = new Hono();

app.get("/", (context) => context.json({ service: "kairn-server" }));
