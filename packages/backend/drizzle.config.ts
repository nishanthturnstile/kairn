import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.MIGRATION_DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  ...(databaseUrl ? { dbCredentials: { url: databaseUrl } } : {}),
});
