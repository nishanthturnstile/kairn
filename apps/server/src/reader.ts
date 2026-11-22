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

// The server can run without the Reader build. This document needs no scripts
// or compiled assets and never contains information from the requested URL.
export const readerFallback = `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<title>Story unavailable</title>
<style>
  html { color-scheme: light dark; background: #fbfaf6; color: #20221d; }
  body { max-width: 38rem; margin: 0 auto; padding: 2rem 1rem; font: 1rem/1.55 system-ui, sans-serif; }
  h1 { font: 2rem/1.15 Georgia, serif; margin: 2rem 0 0.5rem; }
  a { color: inherit; display: inline-block; padding-block: 0.75rem; text-underline-offset: 0.2em; }
  a:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
  @media (prefers-color-scheme: dark) {
    html { background: #1b1d1a; color: #f1f2e7; }
  }
</style>
</head>
<body>
<header><a href="/dashboard">Kairn</a></header>
<main>
<h1>Story unavailable</h1>
<p>This story is currently unavailable.</p>
<a href="/journeys">Go to Journeys</a>
</main>
</body>
</html>`;
