import { Button, Skeleton } from "../../components/ui/index";

export function ConnectionActionSkeleton({ label }: { label: string }) {
  return (
    <Skeleton className="h-auto w-fit rounded-sm">
      <Button size="sm" disabled className="invisible">
        {label}
      </Button>
    </Skeleton>
  );
}
