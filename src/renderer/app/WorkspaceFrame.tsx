import type { ReactNode, Ref } from "react";
import { ActivityPanel } from "./ActivityPanel";
import { LayoutTransition, ViewTransition } from "../components/layout/ViewTransition";

export function WorkspaceFrame({
  children,
  contentRef,
  settings = false,
  profileId,
}: {
  children: ReactNode;
  contentRef?: Ref<HTMLElement>;
  settings?: boolean;
  profileId?: string | undefined;
}) {
  return (
    <LayoutTransition className="app-workspace-backdrop flex min-h-0 min-w-0 flex-1 flex-col">
      <ViewTransition
        ref={contentRef ?? null}
        as="main"
        data-layout-region=""
        className={
          settings ? "min-h-0 min-w-0 flex-1" : "app-canvas min-h-0 min-w-0 flex-1 bg-bg-base"
        }
      >
        {children}
      </ViewTransition>
      <ActivityPanel key={profileId} />
    </LayoutTransition>
  );
}
