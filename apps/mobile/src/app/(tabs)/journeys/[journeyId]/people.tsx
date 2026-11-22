import { journeyPath } from "@kairn/contracts/journeys";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Action, AppText } from "../../../../components/fold/primitives";
import { JourneyPeople } from "../../../../components/journeys/people";
import {
  JourneyGate,
  JourneyScreen,
} from "../../../../components/journeys/states";

export default function PeopleRoute() {
  const { journeyId: id } = useLocalSearchParams();
  const router = useRouter();
  const path = journeyPath.safeParse({ journeyId: id });
  if (!path.success)
    return (
      <JourneyScreen>
        <AppText text="This journey is unavailable." />
        <Action
          label="Back to Journeys"
          onPress={() => router.dismissTo("/journeys")}
        />
      </JourneyScreen>
    );
  const { journeyId } = path.data;
  return (
    <JourneyGate title="People" destination={`/journeys/${journeyId}/people`}>
      {(scope) => (
        <JourneyPeople
          key={`${scope.accountId}/${journeyId}`}
          scope={scope}
          journeyId={journeyId}
        />
      )}
    </JourneyGate>
  );
}
