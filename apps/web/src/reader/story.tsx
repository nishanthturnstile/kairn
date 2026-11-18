import type { ReaderStory } from "@kairn/contracts";
import { useState } from "react";

export const unavailableTitle = "Story unavailable";
export const unavailableSummary = "This story is currently unavailable.";

export function Story({ story }: { story: ReaderStory | null }) {
  const [largeText, setLargeText] = useState(false);

  return (
    <main className="mx-auto grid max-w-3xl gap-8 px-5 py-section sm:px-10">
      <header className="grid gap-3 border-b pb-6">
        <a className="w-fit font-semibold text-primary" href="/discover">
          Kairn
        </a>
        <h1 className="text-title font-semibold tracking-tight">
          {story?.title ?? unavailableTitle}
        </h1>
        <p className="text-muted-foreground">
          {story?.summary ?? unavailableSummary}
        </p>
      </header>
      {story && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <nav aria-label="Chapters">
              <ol className="grid gap-2">
                {story.chapters.map((chapter) => (
                  <li key={chapter.id}>
                    <a
                      className="text-primary underline underline-offset-4"
                      href={`#chapter-${encodeURIComponent(chapter.id)}`}
                    >
                      {chapter.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            <button
              type="button"
              aria-pressed={largeText}
              onClick={() => setLargeText((current) => !current)}
              className="min-h-11 rounded-lg border bg-card px-4 text-sm font-medium"
            >
              Larger text
            </button>
          </div>
          <article
            className={
              largeText
                ? "grid gap-8 text-xl/relaxed"
                : "grid gap-8 text-base/relaxed"
            }
          >
            {story.chapters.map((chapter) => (
              <section
                className="grid gap-2"
                id={`chapter-${chapter.id}`}
                key={chapter.id}
              >
                <h2 className="text-xl font-semibold">{chapter.title}</h2>
                <p className="whitespace-pre-line">{chapter.body}</p>
              </section>
            ))}
          </article>
        </>
      )}
    </main>
  );
}
