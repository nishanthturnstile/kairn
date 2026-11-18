import type { ReaderStory } from "@kairn/contracts";
import { useState } from "react";
import { AppearanceSelect } from "../components/appearance-select";
import { Button } from "../components/ui/button";

export const unavailableTitle = "Story unavailable";
export const unavailableSummary = "This story is currently unavailable.";

export function Story({ story }: { story: ReaderStory | null }) {
  const [largeText, setLargeText] = useState(false);

  return (
    <main className="story-reader">
      <div className="story-tools">
        <a className="story-wordmark" href="/discover">
          Kairn
        </a>
        <AppearanceSelect />
      </div>
      <header className="story-intro">
        <h1 className="story-heading">{story?.title ?? unavailableTitle}</h1>
        <p className="text-muted-foreground">
          {story?.summary ?? unavailableSummary}
        </p>
      </header>
      {story ? (
        <>
          <div className="story-tools">
            {story.chapters.length > 0 && (
              <nav aria-label="Chapters">
                <ol>
                  {story.chapters.map((chapter) => (
                    <li key={chapter.id}>
                      <a
                        className="story-link"
                        href={`#chapter-${encodeURIComponent(chapter.id)}`}
                      >
                        {chapter.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}
            <Button
              type="button"
              variant="outline"
              aria-pressed={largeText}
              onClick={() => setLargeText((current) => !current)}
            >
              Larger text
            </Button>
          </div>
          <article className="story-chapters" data-large-text={largeText}>
            {story.chapters.map((chapter) => (
              <section id={`chapter-${chapter.id}`} key={chapter.id}>
                <h2 className="story-heading">{chapter.title}</h2>
                <p>{chapter.body}</p>
              </section>
            ))}
          </article>
        </>
      ) : (
        <a className="story-link" href="/discover">
          Explore public journeys
        </a>
      )}
    </main>
  );
}
