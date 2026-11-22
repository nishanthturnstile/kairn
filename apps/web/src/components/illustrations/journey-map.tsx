import { useId } from "react";

// Decorative folded topographic print for a collection with no journeys yet.
export function JourneyMap() {
  const clip = useId();
  return (
    <div aria-hidden="true" className="journey-map-print">
      <svg viewBox="0 0 288 160" focusable="false" aria-hidden="true">
        <defs>
          <clipPath id={clip}>
            <path d="M41 51 107 28 171 45 235 23 247 112 181 137 117 118 52 140Z" />
          </clipPath>
        </defs>
        <path
          d="m42 112 65-22 66 18 60-25 20 35-70 27-65-18-57 19Z"
          fill="var(--fold-map-shadow)"
        />
        <g clipPath={`url(#${clip})`}>
          <path d="M32 17h222v129H32z" fill="var(--fold-map-paper)" />
          <path d="m107 28 64 17 10 92-64-19Z" fill="var(--fold-map-land)" />
          <g fill="none" stroke="var(--fold-map-contour)" strokeWidth="1.3">
            {[0, 7, 14, 21, 28, 35].map((offset) => (
              <path
                key={offset}
                transform={`translate(0 ${offset})`}
                d="M23 27c26 9 31-10 57-4s18 28 41 24 17-31 46-25 38 31 82 2M32 93c34-20 43 4 72 1s32-21 62-13 51 12 86-6"
              />
            ))}
          </g>
          <path
            d="m107 28 10 90m54-73 10 92"
            stroke="var(--fold-map-ink)"
            opacity=".36"
            strokeDasharray="2 3"
          />
          <path
            d="M72 100c17 5 17-26 36-23s15 21 33 14 9-29 29-26 25-6 38-16"
            fill="none"
            stroke="var(--fold-map-ink)"
            strokeWidth="2.5"
            strokeDasharray="5 4"
            strokeLinecap="round"
          />
          <circle
            cx="72"
            cy="100"
            r="5"
            fill="var(--fold-map-paper)"
            stroke="var(--fold-map-ink)"
            strokeWidth="2"
          />
          <circle
            cx="208"
            cy="49"
            r="6"
            fill="var(--fold-clay)"
            stroke="var(--fold-map-ink)"
            strokeWidth="2"
          />
        </g>
        <path
          d="M41 51 107 28 171 45 235 23 247 112 181 137 117 118 52 140Z"
          fill="none"
          stroke="var(--fold-map-ink)"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
