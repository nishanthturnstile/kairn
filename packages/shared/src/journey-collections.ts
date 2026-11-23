export const journeyCollections = {
  discover: {
    title: "Discover",
    description: "Stories and practical details from published journeys.",
    emptyTitle: "No published journeys yet",
    emptyDescription: "Only journeys shared publicly can appear here.",
    action: { label: "Open Journeys", to: "/journeys" },
  },
  saved: {
    title: "Saved",
    description: "Journeys to revisit when you’re planning.",
    emptyTitle: "Nothing saved yet",
    emptyDescription:
      "Journeys you bookmark from Discover will appear in your private collection.",
    action: { label: "Browse Discover", to: "/discover" },
  },
} as const;

export type JourneyCollection = keyof typeof journeyCollections;
