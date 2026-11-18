import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const forbidden =
  /(?:packages\/backend\/|apps\/(?:server|worker)\/|(?:^|\/)node_modules\/(?:\.pnpm\/)?(?:@kairn[+/]backend|@aws-sdk[+/]|@ai-sdk[+/]|(?:nodemailer|pg|pg-boss|pino|sharp|drizzle-orm|ai)(?:[/@]|$)))/;
const output = process.argv[2];

function sources(map) {
  return map.sources ?? map.sections?.flatMap(({ map }) => sources(map)) ?? [];
}

for (const [label, directory] of [
  ["web", join(output, "web")],
  ["Android", join(output, "mobile/_expo/static/js/android")],
  ["iOS", join(output, "mobile/_expo/static/js/ios")],
]) {
  const maps = (await readdir(directory, { recursive: true })).filter((file) =>
    file.endsWith(".map"),
  );
  const files = (
    await Promise.all(
      maps.map(async (file) =>
        sources(JSON.parse(await readFile(join(directory, file), "utf8"))),
      ),
    )
  ).flat();
  if (!files.length)
    throw new Error(`No sources found in the ${label} client maps.`);
  const hits = [...new Set(files.filter((file) => forbidden.test(file)))];
  if (hits.length)
    throw new Error(
      `${label} bundle contains server-only sources:\n${hits.join("\n")}`,
    );
  console.log(
    `Checked ${files.length} source entries in the ${label} client bundle.`,
  );
}
