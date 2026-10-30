import { t } from "@shared/i18n";
import { GitError } from "@shared/errors";
import type { SessionContext, SessionSnapshot } from "@shared/identity/profile-session";
import type { IdentityManager } from "./identity-manager";
import type { ProfileSessionRepository } from "../persistence/profile-session-repository";

export class ProfileSessions {
  private generation = 0;
  private bindings = new Map<number, SessionContext>();
  private transitioning = new Set<number>();

  constructor(
    private readonly identity: IdentityManager,
    private readonly store: ProfileSessionRepository,
  ) {
    identity.onChange((profile) => {
      for (const [caller, context] of this.bindings)
        if (context.profileId !== profile?.id) this.bindings.delete(caller);
    });
  }

  open(callerId: number): SessionSnapshot | null {
    if (this.transitioning.has(callerId))
      throw new GitError({
        kind: "invalid-input",
        operation: t("operations.openSession"),
        message: t("main.identity.profileSessions.waitForTheProfileTransitionToFinish"),
      });

    const profile = this.identity.getActive();

    if (!profile) {
      this.bindings.delete(callerId);
      return null;
    }

    const saved = this.store.read(profile.id, "primary");

    return this.bindPrepared(callerId, profile.id, saved);
  }

  bindPrepared(
    callerId: number,
    profileId: string,
    saved: Omit<SessionSnapshot, "context">,
  ): SessionSnapshot {
    const context = { profileId, windowId: "primary", generation: ++this.generation };
    this.bindings.set(callerId, context);
    return { ...saved, context };
  }

  change(callerId: number, context: SessionContext, change: unknown): void {
    this.requireContext(callerId, context);
    this.store.change(context.profileId, context.windowId, change);
  }

  reset(callerId: number, context: SessionContext): SessionSnapshot | null {
    this.requireContext(callerId, context);
    this.store.reset(context.profileId, context.windowId);
    return this.open(callerId);
  }

  clear(): void {
    this.bindings.clear();
    this.transitioning.clear();
    this.generation++;
  }

  close(callerId: number): void {
    this.bindings.delete(callerId);
  }

  hasBinding(callerId: number): boolean {
    return this.bindings.has(callerId);
  }

  async transition<T>(callerId: number, work: () => Promise<T>): Promise<T> {
    if (this.transitioning.has(callerId))
      throw new GitError({
        kind: "invalid-input",
        operation: t("operations.switchProfile"),
        message: t("main.identity.profileSessions.aProfileTransitionIsAlreadyInProgress"),
      });

    this.transitioning.add(callerId);

    try {
      return await work();
    } finally {
      this.transitioning.delete(callerId);
    }
  }

  private requireContext(callerId: number, context: SessionContext): void {
    const bound = this.bindings.get(callerId);

    if (
      this.transitioning.has(callerId) ||
      !context ||
      !bound ||
      context.profileId !== bound.profileId ||
      context.windowId !== bound.windowId ||
      context.generation !== bound.generation ||
      this.identity.getActive()?.id !== context.profileId
    ) {
      throw new GitError({
        kind: "invalid-input",
        operation: t("operations.saveProfileSession"),
        message: t(
          "main.identity.profileSessions.thisSessionIsStaleReloadTheCurrentProfileBeforeSaving",
        ),
      });
    }
  }
}
