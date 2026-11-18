import { Hono } from "hono";

export const app = new Hono();

app.get("/", (context) => context.json({ service: "kairn-server" }));
app.get("/api", (context) => context.json({ service: "kairn-server" }));
