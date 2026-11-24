import { Link } from "@tanstack/react-router";
import { BadgeCheck } from "lucide-react";
import { useSyncExternalStore } from "react";
import {
  getAppearance,
  getServerAppearance,
  setAppearance,
  subscribeToAppearance,
} from "@/lib/appearance";
import { useRecordingImports } from "@/lib/recording-api";
import type { AccountScope } from "@/lib/session";
import { AppearanceChoices } from "../appearance-switcher";
import { InviteDiscoverySetting } from "../invite-discovery-setting";
import { PageHeading } from "../page-heading";
import { ProfileName } from "../profile-name";
import { Alert, AlertDescription } from "../ui/alert";
import { ButtonLink } from "../ui/button";
import { Card, CardContent, CardHeader } from "../ui/card";
import { SignedInDevices } from "./devices";

export function AccountSettings({
  scope,
  accountId,
  name,
  email,
  resumeSetup,
  signOutError,
}: {
  scope: AccountScope;
  accountId: string;
  name: string;
  email: string;
  resumeSetup: boolean;
  signOutError?: string | null;
}) {
  const recordings = useRecordingImports(scope);
  const appearance = useSyncExternalStore(
    subscribeToAppearance,
    getAppearance,
    getServerAppearance,
  );

  return (
    <div className="@container/account grid gap-6">
      <PageHeading title="Account" />
      {signOutError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{signOutError}</AlertDescription>
        </Alert>
      )}
      {resumeSetup && (
        <ButtonLink
          render={<Link to="/onboarding" />}
          size="lg"
          className="justify-self-start"
        >
          Resume setup
        </ButtonLink>
      )}
      <div className="grid items-start gap-4 @min-[49rem]/account:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-4">
          <section aria-labelledby="account-profile">
            <Card className="gap-4 [--card-spacing:--spacing(4)]">
              <CardHeader>
                <h2
                  id="account-profile"
                  className="font-heading text-xl font-semibold"
                >
                  Profile
                </h2>
              </CardHeader>
              <CardContent className="grid min-w-0 gap-3 [&_button]:min-h-touch">
                <ProfileName
                  accountId={accountId}
                  scope={scope}
                  embedded
                  fallbackName={name}
                />
                <hr className="border-border" />
                <dl className="grid min-w-0 gap-1">
                  <dt className="text-sm font-semibold text-muted-foreground">
                    Email address
                  </dt>
                  <dd className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-semibold wrap-anywhere">{email}</span>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-success">
                      <BadgeCheck
                        aria-hidden="true"
                        className="size-4 shrink-0"
                      />
                      Verified
                    </span>
                  </dd>
                </dl>
              </CardContent>
            </Card>
          </section>
          <section aria-labelledby="account-preferences">
            <Card className="gap-4 [--card-spacing:--spacing(4)]">
              <CardHeader>
                <h2
                  id="account-preferences"
                  className="font-heading text-xl font-semibold"
                >
                  Preferences
                </h2>
              </CardHeader>
              <CardContent className="grid min-w-0 gap-4">
                <InviteDiscoverySetting scope={scope} accountId={accountId} />
                <hr className="border-border" />
                <section
                  aria-labelledby="account-appearance"
                  className="grid gap-2 [&_[aria-pressed]]:[transition-property:scale]!"
                >
                  <h3 id="account-appearance" className="font-semibold">
                    Appearance
                  </h3>
                  <AppearanceChoices
                    appearance={appearance}
                    onChoose={setAppearance}
                  />
                  <p className="text-sm text-muted-foreground">
                    Outdoor increases contrast in bright light.
                  </p>
                </section>
              </CardContent>
            </Card>
          </section>
        </div>
        <SignedInDevices accountId={accountId} scope={scope} />
        {recordings.data && (
          <ButtonLink
            render={<Link to="/account/recordings" />}
            variant="outline"
            className="justify-self-start"
          >
            Your recordings
          </ButtonLink>
        )}
      </div>
    </div>
  );
}
