import { UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "./ui/avatar";

export function ProfileAvatar({ name, size }: { name?: string; size?: "lg" }) {
  const initials = name
    ?.trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => Array.from(part)[0]?.toLocaleUpperCase())
    .join("");
  return (
    <Avatar size={size} aria-hidden="true">
      <AvatarFallback>
        {initials || <UserRound className="size-4" />}
      </AvatarFallback>
    </Avatar>
  );
}
