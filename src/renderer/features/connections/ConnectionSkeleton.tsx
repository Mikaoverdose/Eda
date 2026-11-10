import { Button, Skeleton } from "../../components/ui/index";
import type { AccentColor } from "@shared/preferences/accent";
import { ProfileAvatar } from "../../components/ui/display/ProfileAvatar";

export function ConnectionActionSkeleton({ label }: { label: string }) {
  return (
    <Skeleton className="h-auto w-fit rounded-sm">
      <Button size="sm" disabled className="invisible">
        {label}
      </Button>
    </Skeleton>
  );
}

export function ConnectionAccountSkeleton({ login, hue }: { login: string; hue: AccentColor }) {
  return (
    <div aria-hidden="true" className="flex min-w-0 items-center gap-2.5">
      <ProfileAvatar name={login} hue={hue} loading />
      <Skeleton className="h-auto min-w-0 max-w-full truncate text-sm font-medium">
        <span className="invisible">@{login}</span>
      </Skeleton>
    </div>
  );
}
