import { readFile, writeFile } from "node:fs/promises";
import { createV1Api, getOpenApiDocument } from "../src/http/v1.js";

const output = new URL(
  "../../../packages/contracts/openapi.json",
  import.meta.url,
);
const api = createV1Api(async () => {});
const document = `${JSON.stringify(getOpenApiDocument(api), null, 2)}\n`;

if (process.argv.includes("--check")) {
  if ((await readFile(output, "utf8")) !== document) {
    throw new Error("OpenAPI is out of date. Run pnpm api:generate.");
  }
} else {
  await writeFile(output, document);
}
