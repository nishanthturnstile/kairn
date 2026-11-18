import type { ReaderStory } from "@kairn/contracts";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { Story, unavailableSummary, unavailableTitle } from "./story";

export interface ReaderAssets {
  entry: string;
  styles: readonly string[];
}

export function renderReader(input: ReaderStory | null, assets: ReaderAssets) {
  const story = input && {
    title: input.title,
    summary: input.summary,
    chapters: input.chapters.map(({ id, title, body }) => ({
      id,
      title,
      body,
    })),
  };
  const title = story?.title ?? unavailableTitle;
  const summary = story?.summary ?? unavailableSummary;
  const markup = renderToString(<Story story={story} />);
  const data = JSON.stringify(story).replaceAll("<", "\\u003c");
  const frame = renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <meta name="referrer" content="no-referrer" />
        <title>{title}</title>
        <meta name="description" content={summary} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={summary} />
        {assets.styles.map((href) => (
          <link rel="stylesheet" href={href} key={href} />
        ))}
      </head>
      <body>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: React rendered these children before serializing the document. */}
        <div id="reader" dangerouslySetInnerHTML={{ __html: markup }} />
        <script id="reader-data" type="application/json">
          {data}
        </script>
        <script type="module" src={assets.entry}></script>
      </body>
    </html>,
  );
  return `<!doctype html>${frame}`;
}
