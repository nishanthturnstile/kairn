import createClient, { type Client, type ClientOptions } from "openapi-fetch";
import type { paths } from "./generated/api.js";

export type { components, paths } from "./generated/api.js";
export type {
  CreateJourney,
  DashboardJourney,
  DashboardSummary,
  InvitableJourneysPage,
  JourneyHistory,
  JourneyHistoryQuery,
  JourneyInputField,
  JourneyInputIssue,
  JourneyPeoplePage,
  JourneySchedule,
  PrivateJourney,
} from "./journeys.js";
export type { ReaderStory } from "./reader.js";

export function createApiClient(options?: ClientOptions): Client<paths> {
  return createClient<paths>(options);
}
export type {
  AdvanceCompanionSetup,
  AdvanceOnboarding,
  CompanionSetup,
  IdentityDevices,
  OnboardingIntent,
  OnboardingProgress,
  RestrictionConfirmation,
} from "./identity.js";
