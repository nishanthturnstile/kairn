import {
  type JourneyCollection,
  journeyCollections,
} from "@kairn/shared/journey-collections";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import { Bookmark } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import coast from "../../../../packages/design-tokens/assets/discover-coast.webp";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./ui/alert";
import { Button, ButtonLink } from "./ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./ui/empty";
import { ContentLoading } from "./ui/loading";

export function CollectionsPage({
  destination,
}: {
  destination: JourneyCollection;
}) {
  const { scope } = useRouteContext({ from: "__root__" });
  const copy = journeyCollections[destination];
  const discover = destination === "discover";
  const heading = useRef<HTMLHeadingElement>(null);
  const emptyHeading = useRef<HTMLHeadingElement>(null);
  const focusAfterRetry = useRef(false);
  const [retrying, setRetrying] = useState(false);
  const readiness = useQuery({
    queryKey: [scope.accountId, "readiness"],
    async queryFn({ signal }) {
      const { data } = await scope.api.GET("/api/v1/ready", { signal });
      if (data?.status !== "ready") throw new Error("Service unavailable");
      return data;
    },
  });

  // The Browse Discover link replaces the focused content in Saved.
  useEffect(() => {
    if (discover && document.activeElement === document.body)
      heading.current?.focus({ preventScroll: true });
  }, [discover]);

  useEffect(() => {
    if (retrying || !focusAfterRetry.current) return;
    focusAfterRetry.current = false;
    if (readiness.isSuccess && document.activeElement === document.body)
      emptyHeading.current?.focus({ preventScroll: true });
  }, [readiness.isSuccess, retrying]);

  const action = (
    <ButtonLink
      render={<Link to={copy.action.to} />}
      variant={discover ? "default" : "outline"}
    >
      {copy.action.label}
    </ButtonLink>
  );

  return (
    <section className="@container/collection grid max-w-5xl gap-section">
      <header className="grid gap-1.5">
        <h1
          ref={heading}
          tabIndex={-1}
          className="w-fit text-4xl font-bold tracking-tight @min-[48rem]/collection:text-5xl"
        >
          {copy.title}
        </h1>
        <p className="max-w-prose text-muted-foreground">{copy.description}</p>
      </header>
      {retrying || readiness.isError ? (
        <Alert variant="destructive" className="max-w-2xl">
          <AlertTitle>Couldn’t connect to Kairn</AlertTitle>
          <AlertDescription>
            Check your connection, then try again.
          </AlertDescription>
          <AlertAction>
            <Button
              variant="outline"
              aria-disabled={retrying}
              feedback={retrying ? "pending" : "idle"}
              onClick={(event) => {
                if (retrying) return;
                focusAfterRetry.current =
                  document.activeElement === event.currentTarget;
                setRetrying(true);
                void readiness.refetch().finally(() => setRetrying(false));
              }}
            >
              {retrying ? "Trying again…" : "Try again"}
            </Button>
          </AlertAction>
        </Alert>
      ) : readiness.isPending ? (
        <div className="max-w-2xl">
          <ContentLoading label="Checking availability" />
        </div>
      ) : discover ? (
        <Empty className="grid overflow-hidden gap-0 p-0 @min-[42rem]/collection:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div
            aria-hidden="true"
            className="relative aspect-[2/1] w-full bg-accent @min-[42rem]/collection:aspect-auto @min-[42rem]/collection:min-h-72 @min-[42rem]/collection:self-stretch"
          >
            <img
              src={coast}
              alt=""
              width={1160}
              height={773}
              className="absolute inset-0 size-full object-cover"
            />
          </div>
          <div className="grid min-w-0 content-center justify-items-start gap-4 self-stretch p-4 @min-[36rem]/collection:p-6 @min-[52rem]/collection:p-8">
            <EmptyHeader>
              <EmptyTitle
                ref={emptyHeading}
                tabIndex={-1}
                className="text-balance text-2xl font-bold @min-[52rem]/collection:text-3xl"
              >
                {copy.emptyTitle}
              </EmptyTitle>
              <EmptyDescription className="max-w-[35ch]">
                {copy.emptyDescription}
              </EmptyDescription>
            </EmptyHeader>
            {action}
          </div>
        </Empty>
      ) : (
        <Empty className="max-w-3xl p-4 @min-[38rem]/collection:p-6">
          <div className="grid w-full min-w-0 items-start gap-4 @min-[36rem]/collection:grid-cols-[1fr_auto] @min-[36rem]/collection:items-center">
            <div className="grid min-w-0 gap-3 @min-[24rem]/collection:grid-cols-[auto_1fr]">
              <EmptyMedia
                variant="icon"
                aria-hidden="true"
                className="size-11 bg-accent text-primary [&_svg]:size-5"
              >
                <Bookmark />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle ref={emptyHeading} tabIndex={-1}>
                  {copy.emptyTitle}
                </EmptyTitle>
                <EmptyDescription className="max-w-[36ch]">
                  {copy.emptyDescription}
                </EmptyDescription>
              </EmptyHeader>
            </div>
            <div className="justify-self-start">{action}</div>
          </div>
        </Empty>
      )}
    </section>
  );
}
