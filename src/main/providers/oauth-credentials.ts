import { errorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import { randomUUID } from "node:crypto";
import type {
  ProviderAccountRepository,
  SavedProviderAccount,
} from "../persistence/provider-account-repository";
import { secretKeys, type SecretStore } from "../secrets/secret-store";
import type { OAuthTokens } from "./oauth";

export interface AuthorizedAccount {
  signInId: string;
  profileId: string;
  accountId: string;
  login: string;
  tokens: OAuthTokens;
}

const messages = {
  github: {
    cancelled: "main.providers.githubAuth.theGitHubConnectionWasCancelledSignInAgain",
    changed: "main.providers.githubAuth.theGitHubAccountChangedRetryThePull",
  },
  gitlab: {
    cancelled: "main.providers.gitlabAuth.theGitLabConnectionWasCancelledSignInAgain",
    changed: "main.providers.gitlabAuth.theGitLabAccountChangedRetryThePull",
  },
} as const;

export class OAuthCredentials {
  readonly authorized = new Map<string, AuthorizedAccount>();
  private readonly committing = new Map<string, Promise<void>>();
  private readonly refreshing = new Map<string, Promise<OAuthTokens>>();

  constructor(
    private readonly provider: "github" | "gitlab",
    private readonly accounts: ProviderAccountRepository,
    private readonly secrets: SecretStore,
    private readonly now: () => number,
  ) {}

  owns(account: SavedProviderAccount): boolean {
    return account.credentialRef.startsWith(this.prefix(account.profileId, account.accountId));
  }

  async settle(): Promise<void> {
    await Promise.allSettled([...this.committing.values(), ...this.refreshing.values()]);
  }

  commit(candidate: AuthorizedAccount): Promise<void> {
    const existing = this.committing.get(candidate.profileId);

    if (existing)
      return existing.then(async () => {
        if (this.authorized.get(candidate.profileId) === candidate) await this.commit(candidate);
      });

    const work = this.save(candidate).finally(() => this.committing.delete(candidate.profileId));

    this.committing.set(candidate.profileId, work);
    return work;
  }

  async currentTokens(
    account: SavedProviderAccount,
    tokens: OAuthTokens,
    refreshTokens: () => Promise<OAuthTokens>,
  ): Promise<OAuthTokens> {
    if (tokens.expiresAt !== undefined && tokens.expiresAt <= this.now() + 60_000) {
      let refresh = this.refreshing.get(account.profileId);

      if (!refresh) {
        refresh = refreshTokens().finally(() => this.refreshing.delete(account.profileId));
        this.refreshing.set(account.profileId, refresh);
      }

      tokens = await refresh;
    }

    if (this.accounts.find(account.profileId)?.credentialRef !== account.credentialRef)
      throw this.failure("changed");

    return tokens;
  }

  private async save(candidate: AuthorizedAccount): Promise<void> {
    const { profileId, accountId, login, tokens } = candidate;
    const previous = this.accounts.find(profileId);
    const credentialRef = this.prefix(profileId, accountId) + randomUUID();

    await this.secrets.set(credentialRef, JSON.stringify(tokens));

    try {
      if (this.authorized.get(profileId) !== candidate) throw this.failure("cancelled");

      this.accounts.save({ profileId, accountId, login, credentialRef, state: "connected" });
      this.authorized.delete(profileId);
    } catch (error) {
      await this.secrets.delete(credentialRef);
      throw error;
    }

    if (previous && this.owns(previous)) await this.secrets.delete(previous.credentialRef);
  }

  private prefix(profileId: string, accountId: string): string {
    return (
      secretKeys.provider(profileId, `${this.provider}-oauth`, `${this.provider}.com`, accountId) +
      ":"
    );
  }

  private failure(reason: "cancelled" | "changed"): GitError {
    return new GitError({
      kind: this.provider === "github" ? "github-auth-required" : "auth-failed",
      operation: t(
        this.provider === "github" ? "operations.gitHubSignIn" : "operations.gitLabSignIn",
      ),
      message: errorText(messages[this.provider][reason]),
    });
  }
}
