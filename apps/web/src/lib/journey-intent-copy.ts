import type { OnboardingIntent } from "@kairn/contracts";

export const journeyIntentCopy = {
  plan: {
    action: "Plan a journey",
    choice: "Set up an upcoming journey with a title and dates.",
    heading: "Plan your first journey",
    description:
      "Add a title and dates to see this journey in your upcoming plans.",
    guidance:
      "Enter the planned start in the journey’s local time. You can leave the end date open.",
  },
  record: {
    action: "Record a past journey",
    choice: "Start a private record of a journey you’ve already taken.",
    heading: "Record a journey you’ve taken",
    description: "Add a title and dates to start your private journey history.",
    guidance:
      "Enter the start in the journey’s local time. Add the end if you know it.",
  },
} satisfies Record<
  OnboardingIntent,
  {
    action: string;
    choice: string;
    heading: string;
    description: string;
    guidance: string;
  }
>;
