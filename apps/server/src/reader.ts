import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ReaderStory } from "@kairn/contracts";

interface Chunk {
  file: string;
  css?: string[];
  imports?: string[];
}

export async function loadReader(buildDir: string) {
  const manifest: Record<string, Chunk> = JSON.parse(
    await readFile(resolve(buildDir, "client/.vite/manifest.json"), "utf8"),
  );
  const key = "src/reader/client.tsx";
  const entry = manifest[key];
  if (!entry) throw new Error("Reader entry is missing from the web manifest.");

  const visited = new Set<string>();
  const styles = new Set<string>();
  function collectStyles(chunkKey: string) {
    if (visited.has(chunkKey)) return;
    visited.add(chunkKey);
    const chunk = manifest[chunkKey];
    if (!chunk)
      throw new Error("Reader asset is missing from the web manifest.");
    for (const dependency of chunk.imports ?? []) collectStyles(dependency);
    for (const file of chunk.css ?? []) styles.add(assetUrl(file));
  }
  collectStyles(key);

  const assets = { entry: assetUrl(entry.file), styles: [...styles] };
  const renderer = (await import(
    pathToFileURL(resolve(buildDir, "server/server.js")).href
  )) as {
    renderReader: (
      story: ReaderStory | null,
      assets: { entry: string; styles: string[] },
    ) => string;
  };
  return (story: ReaderStory | null) => renderer.renderReader(story, assets);
}

function assetUrl(file: string) {
  if (!/^assets\/[A-Za-z0-9_-]+\.(js|css)$/.test(file))
    throw new Error("Invalid reader asset path.");
  return `/${file}`;
}
