import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, LogOut, UserRound } from "lucide-react";
import {
  type MouseEventHandler,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  getAppearance,
  getServerAppearance,
  setAppearance,
  subscribeToAppearance,
} from "@/lib/appearance";
import { authClient } from "@/lib/auth";
import { useProfile } from "@/lib/profile";
import type { AccountScope } from "@/lib/session";
import { useSessionAccess } from "@/lib/session-access";
import {
  AppearanceChoices,
  AppearanceIcon,
  appearanceLabels,
} from "../appearance-switcher";
import { ProfileAvatar } from "../profile-avatar";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export function WorkspaceAccountMenu({
  scope,
  accountId,
  onNavigate,
}: {
  scope: AccountScope;
  accountId: string;
  onNavigate: MouseEventHandler<HTMLAnchorElement>;
}) {
  const { data } = authClient.useSession();
  const { signOut } = useSessionAccess();
  const { data: profile } = useProfile(scope, accountId);
  const user = data?.user.id === accountId ? data.user : undefined;
  const name = profile?.displayName || user?.name;
  const profileTrigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const appearanceTitle = useRef<HTMLHeadingElement>(null);
  const choices = useRef<HTMLDivElement>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const appearance = useSyncExternalStore(
    subscribeToAppearance,
    getAppearance,
    getServerAppearance,
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              ref={profileTrigger}
              type="button"
              variant="ghost"
              className="min-h-touch max-w-56 shrink-0 justify-end px-2"
              aria-label={name ? `${name} account menu` : "Account menu"}
            />
          }
        >
          <ProfileAvatar />
          <span className="hidden truncate sm:inline">{name || "Account"}</span>
          <ChevronDown aria-hidden="true" className="hidden sm:block" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          collisionPadding={8}
          aria-label="Account menu"
          finalFocus={() => (appearanceOpen ? false : undefined)}
          className="w-[18rem] min-w-0 p-1.5"
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-start gap-3 px-2 py-3">
              <ProfileAvatar name={name} />
              <span className="grid min-w-0 gap-0.5">
                <span className="font-semibold text-foreground">
                  {name || "Account"}
                </span>
                {user?.email && (
                  <span className="font-normal">{user.email}</span>
                )}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuItem
              render={<Link to="/account" onClick={onNavigate} />}
              className="min-h-touch"
            >
              <UserRound aria-hidden="true" />
              Account
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-touch flex-wrap"
              aria-haspopup="dialog"
              onClick={() => setAppearanceOpen(true)}
            >
              <AppearanceIcon mode={appearance} />
              <span className="min-w-0 flex-1">Appearance</span>
              <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
                {appearanceLabels[appearance]}
                <ChevronRight aria-hidden="true" />
              </span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              variant="destructive"
              className="min-h-touch"
              onClick={() => void signOut()}
            >
              <LogOut aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={appearanceOpen} onOpenChange={setAppearanceOpen}>
        <DialogContent
          ref={popup}
          className="w-[min(19rem,calc(100%-16px))]"
          initialFocus={() => {
            const content = popup.current;
            if (content && content.scrollHeight > content.clientHeight)
              return appearanceTitle.current ?? true;
            return (
              choices.current?.querySelector<HTMLButtonElement>(
                'button[aria-pressed="true"]',
              ) ?? true
            );
          }}
          finalFocus={profileTrigger}
        >
          <DialogTitle ref={appearanceTitle} tabIndex={-1}>
            Appearance
          </DialogTitle>
          <div ref={choices}>
            <AppearanceChoices
              appearance={appearance}
              onChoose={(option) => {
                setAppearance(option);
                setAppearanceOpen(false);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
