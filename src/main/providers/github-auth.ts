import { errorText, type ErrorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import { isRecord } from "@shared/validation";
import { INTEGRATIONS } from "@shared/integrations/config";
import {
  isGitHubHttps,
  MAINTAINER_GITHUB_LOGIN,
  type GitHubAccountProfile,
  type GitHubSignIn,
  type GitHubSignInResult,
  type GitHubStatus,
} from "@shared/integrations/github";
import type { TransportCredentials } from "@shared/integrations/remotes";
import { randomUUID } from "node:crypto";
import type {
  GitHubAccountRepository,
  SavedGitHubAccount,
} from "../persistence/github-account-repository";
import { secretKeys, type SecretStore } from "../secrets/secret-store";
import { GitHubProfileCache } from "./github-profile-cache";

const DEVICE_URL = "https://github.com/login/device/code";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_VERIFICATION_URL = "https://github.com/login/device";
const fail = (
  message: ErrorText,
  kind:
    | "invalid-input"
    | "network-failed"
    | "github-auth-required"
    | "keychain-unavailable" = "invalid-input",
) => new GitError({ kind, operation: t("operations.gitHubSignIn"), message });

interface Tokens {
  clientId: string;
  accessToken: string;
  expiresAt?: number;
  refreshToken?: string;
  refreshExpiresAt?: number;
}
interface Authorized {
  signInId: string;
  profileId: string;
  accountId: string;
  login: string;
  tokens: Tokens;
}
interface Pending {
  profileId: string;
  deviceCode: string;
  controller: AbortController;
  signIn: GitHubSignIn;
  nextPoll: number;
}

export class GitHubAuth {
  private readonly clientId = INTEGRATIONS.github.clientId;
  private readonly authorized = new Map<string, Authorized>();
  private readonly committing = new Map<string, Promise<void>>();
  private readonly pending = new Map<string, Pending>();
  private readonly refreshing = new Map<string, Promise<Tokens>>();
  private readonly profiles: GitHubProfileCache;

  constructor(
    private readonly accounts: GitHubAccountRepository,
    private readonly secrets: SecretStore,
    private readonly fetch: typeof globalThis.fetch,
    private readonly now = Date.now,
  ) {
    this.profiles = new GitHubProfileCache((url) => this.request(url), now);
  }

  status(profileId: string): GitHubStatus {
    const saved = this.accounts.find(profileId);
    const account = saved && this.ownsCredential(saved) ? saved : undefined;
    return {
      secureStorage: this.secrets.available,
      account:
        account && !this.authorized.has(profileId)
          ? { id: account.accountId, login: account.login, state: account.state }
          : null,
    };
  }

  async profile(profileId: string): Promise<Omit<GitHubAccountProfile, "avatarDataUrl"> | null> {
    const account = this.accounts.find(profileId);
    if (this.authorized.has(profileId)) return null;
    if (!account || !this.ownsCredential(account) || !/^[1-9][0-9]{0,15}$/.test(account.accountId))
      return null;
    return this.profiles.get({ id: account.accountId, login: account.login });
  }

  maintainerProfile(): Promise<Omit<GitHubAccountProfile, "avatarDataUrl"> | null> {
    return this.profiles.get({ login: MAINTAINER_GITHUB_LOGIN });
  }

  profileUrl(profileId: string): string {
    const account = this.accounts.find(profileId);
    if (!account || !this.ownsCredential(account) || this.authorized.has(profileId))
      throw fail(errorText("main.providers.githubAuth.connectAGitHubAccountFirst"));
    const login = this.profiles.peek(account.accountId)?.login ?? account.login;
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(login))
      throw fail(errorText("main.providers.githubAuth.theGitHubAccountProfileIsInvalid"));
    return `https://github.com/${login}`;
  }

  async begin(profileId: string): Promise<GitHubSignIn> {
    this.requireStorage();
    this.cancelProfile(profileId);
    for (const [id, pending] of this.pending)
      if (pending.signIn.expiresAt <= this.now()) this.cancel(pending.profileId, id);
    if (this.pending.size >= 16)
      throw fail(
        errorText("main.providers.githubAuth.tooManyGitHubSignInsArePendingCancelOneAndTryAgain"),
      );
    const response = await this.request(DEVICE_URL, {
      client_id: this.clientId,
      scope: "repo offline_access",
    });
    if (response["error"]) throw this.oauthError(response["error"]);
    const deviceCode = text(response["device_code"]);
    const userCode = text(response["user_code"]);
    const seconds = secondsValue(response["expires_in"]);
    const interval = secondsValue(response["interval"]);
    if (
      !deviceCode ||
      !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(userCode ?? "") ||
      !seconds ||
      seconds > 900 ||
      !interval ||
      interval > 900 ||
      response["verification_uri"] !== GITHUB_VERIFICATION_URL
    )
      throw fail(
        errorText("main.providers.githubAuth.gitHubReturnedAnInvalidDeviceAuthorizationResponse"),
      );
    const signIn = {
      id: randomUUID(),
      userCode: userCode!,
      expiresAt: this.now() + seconds * 1000,
      intervalMs: interval * 1000,
    };
    this.pending.set(signIn.id, {
      profileId,
      deviceCode,
      signIn,
      nextPoll: this.now() + signIn.intervalMs,
      controller: new AbortController(),
    });
    return signIn;
  }

  async poll(profileId: string, id: string): Promise<GitHubSignInResult> {
    const pending = this.requirePending(profileId, id);
    if (this.now() < pending.nextPoll)
      return { state: "pending", intervalMs: Math.max(1, pending.nextPoll - this.now()) };
    pending.nextPoll = this.now() + pending.signIn.intervalMs;
    try {
      const response = await this.request(
        TOKEN_URL,
        {
          client_id: this.clientId,
          device_code: pending.deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        },
        pending.controller.signal,
      );
      if (response["error"] === "authorization_pending" || response["error"] === "slow_down") {
        if (response["error"] === "slow_down")
          pending.signIn.intervalMs = Math.max(
            pending.signIn.intervalMs + 5000,
            (secondsValue(response["interval"]) ?? 0) * 1000,
          );
        pending.nextPoll = this.now() + pending.signIn.intervalMs;
        return { state: "pending", intervalMs: pending.signIn.intervalMs };
      }
      if (response["error"]) throw this.oauthError(response["error"]);
      const tokens = this.tokens(response, this.clientId);
      const user = await this.request(
        "https://api.github.com/user",
        undefined,
        pending.controller.signal,
        tokens.accessToken,
      );
      if (
        !Number.isSafeInteger(user["id"]) ||
        (user["id"] as number) <= 0 ||
        !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(text(user["login"]) ?? "")
      )
        throw fail(errorText("main.providers.githubAuth.gitHubReturnedAnInvalidAccountIdentity"));
      this.requirePending(profileId, id);
      this.cancel(profileId, id);
      this.authorized.set(profileId, {
        signInId: id,
        profileId,
        accountId: String(user["id"]),
        login: user["login"] as string,
        tokens,
      });
      await this.commit(this.authorized.get(profileId)!);
      return { state: "connected", status: this.status(profileId) };
    } catch (error) {
      this.cancel(profileId, id);
      throw error;
    }
  }

  verifyPending(profileId: string, id: string): string {
    return this.requirePending(profileId, id).signIn.userCode;
  }

  cancel(profileId: string, id: string): void {
    if (this.authorized.get(profileId)?.signInId === id) {
      this.authorized.delete(profileId);
    }
    const pending = this.pending.get(id);
    if (pending?.profileId !== profileId) return;
    pending.controller.abort();
    this.pending.delete(id);
  }

  cancelProfile(profileId: string): void {
    this.authorized.delete(profileId);
    for (const [id, pending] of this.pending)
      if (pending.profileId === profileId) this.cancel(profileId, id);
  }

  cancelAll(): void {
    this.authorized.clear();
    for (const [id, pending] of this.pending) this.cancel(pending.profileId, id);
  }

  async reset(): Promise<void> {
    this.cancelAll();
    await Promise.allSettled([...this.committing.values(), ...this.refreshing.values()]);
    await this.profiles.clear();
  }

  async disconnect(profileId: string): Promise<void> {
    this.cancelProfile(profileId);
    const account = this.accounts.find(profileId);
    if (!account) return;
    this.requireStorage();
    if (this.ownsCredential(account)) await this.secrets.delete(account.credentialRef);
    this.accounts.delete(profileId);
  }

  async forFetch(profileId: string, url: string): Promise<TransportCredentials | undefined> {
    if (!isGitHubHttps(url)) return undefined;
    if (this.authorized.has(profileId))
      throw fail(
        errorText("main.providers.githubAuth.finishConnectingGitHubInProfileSettingsThenRetry"),
        "github-auth-required",
      );
    const account = this.accounts.find(profileId);
    if (!account) return undefined;
    return this.credentials(account);
  }

  private commit(candidate: Authorized): Promise<void> {
    const existing = this.committing.get(candidate.profileId);
    if (existing)
      return existing.then(async () => {
        if (this.authorized.get(candidate.profileId) === candidate) await this.commit(candidate);
      });
    const work = this.saveAuthorized(candidate).finally(() =>
      this.committing.delete(candidate.profileId),
    );
    this.committing.set(candidate.profileId, work);
    return work;
  }

  private async saveAuthorized(candidate: Authorized): Promise<void> {
    const { profileId, accountId, login, tokens } = candidate;
    const previous = this.accounts.find(profileId);
    const credentialRef =
      secretKeys.provider(profileId, "github-oauth", "github.com", accountId) + ":" + randomUUID();
    await this.secrets.set(credentialRef, JSON.stringify(tokens));
    try {
      if (this.authorized.get(profileId) !== candidate)
        throw fail(
          errorText("main.providers.githubAuth.theGitHubConnectionWasCancelledSignInAgain"),
          "github-auth-required",
        );
      this.accounts.save({ profileId, accountId, login, credentialRef, state: "connected" });
      this.authorized.delete(profileId);
    } catch (error) {
      await this.secrets.delete(credentialRef);
      throw error;
    }
    if (previous && this.ownsCredential(previous))
      await this.secrets.delete(previous.credentialRef);
  }

  private async credentials(account: SavedGitHubAccount): Promise<TransportCredentials> {
    this.requireStorage();
    if (account.state !== "connected")
      throw fail(
        errorText("main.providers.githubAuth.reconnectGitHubInTheIntegrationsSectionOf"),
        "github-auth-required",
      );
    let tokens = await this.readTokens(account);
    if (tokens.expiresAt !== undefined && tokens.expiresAt <= this.now() + 60_000) {
      let refresh = this.refreshing.get(account.profileId);
      if (!refresh) {
        refresh = this.refresh(account, tokens).finally(() =>
          this.refreshing.delete(account.profileId),
        );
        this.refreshing.set(account.profileId, refresh);
      }
      tokens = await refresh;
    }
    return { username: "x-access-token", password: tokens.accessToken };
  }

  private async refresh(account: SavedGitHubAccount, tokens: Tokens): Promise<Tokens> {
    if (
      !tokens.refreshToken ||
      (tokens.refreshExpiresAt !== undefined && tokens.refreshExpiresAt <= this.now())
    )
      return this.expired(account);
    const response = await this.request(TOKEN_URL, {
      client_id: tokens.clientId,
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
    });
    if (response["error"]) {
      if (
        ["bad_refresh_token", "expired_token", "invalid_grant"].includes(String(response["error"]))
      )
        return this.expired(account);
      throw this.oauthError(response["error"]);
    }
    const refreshed = this.tokens(response, tokens.clientId);
    const user = await this.request(
      "https://api.github.com/user",
      undefined,
      undefined,
      refreshed.accessToken,
    );
    if (String(user["id"]) !== account.accountId) return this.expired(account);
    const current = this.accounts.find(account.profileId);
    if (current?.credentialRef !== account.credentialRef)
      throw fail(
        errorText("main.providers.githubAuth.theGitHubAccountChangedRetryThePull"),
        "github-auth-required",
      );
    await this.secrets.set(account.credentialRef, JSON.stringify(refreshed));
    return refreshed;
  }

  private expired(account: SavedGitHubAccount): never {
    if (this.accounts.find(account.profileId)?.credentialRef === account.credentialRef)
      this.accounts.save({ ...account, state: "expired" });
    throw fail(
      errorText("main.providers.githubAuth.yourGitHubLoginExpiredReconnectGitHubThenRetryThePull"),
      "github-auth-required",
    );
  }

  private async readTokens(account: SavedGitHubAccount): Promise<Tokens> {
    if (!this.ownsCredential(account)) return this.expired(account);
    const raw = await this.secrets.get(account.credentialRef);
    try {
      const value: unknown = raw ? JSON.parse(raw) : null;
      if (isRecord(value)) {
        const accessToken = text(value["accessToken"]);
        const clientId = text(value["clientId"]);
        const expiresAt = value["expiresAt"];
        const refreshToken = text(value["refreshToken"]);
        const refreshExpiresAt = value["refreshExpiresAt"];
        if (
          accessToken?.startsWith("gho_") &&
          clientId === this.clientId &&
          (expiresAt === undefined ||
            (typeof expiresAt === "number" && Number.isSafeInteger(expiresAt))) &&
          (value["refreshToken"] === undefined || refreshToken !== undefined) &&
          (refreshExpiresAt === undefined ||
            (typeof refreshExpiresAt === "number" && Number.isSafeInteger(refreshExpiresAt)))
        )
          return {
            accessToken,
            clientId,
            ...(expiresAt !== undefined ? { expiresAt } : {}),
            ...(refreshToken !== undefined ? { refreshToken } : {}),
            ...(refreshExpiresAt !== undefined ? { refreshExpiresAt } : {}),
          };
      }
    } catch {}
    return this.expired(account);
  }

  private ownsCredential(account: SavedGitHubAccount): boolean {
    return account.credentialRef.startsWith(
      secretKeys.provider(account.profileId, "github-oauth", "github.com", account.accountId) + ":",
    );
  }

  private tokens(response: Record<string, unknown>, clientId: string): Tokens {
    const accessToken = text(response["access_token"]);
    const refreshToken = text(response["refresh_token"]);
    const expires = secondsValue(response["expires_in"]);
    const refreshExpires = secondsValue(response["refresh_token_expires_in"]);
    if (
      !accessToken?.startsWith("gho_") ||
      typeof response["scope"] !== "string" ||
      !response["scope"].split(/[ ,]+/).includes("repo") ||
      response["token_type"] !== "bearer" ||
      (response["expires_in"] !== undefined && !expires) ||
      (response["refresh_token"] !== undefined && !refreshToken) ||
      (response["refresh_token_expires_in"] !== undefined && !refreshExpires)
    )
      throw fail(errorText("main.providers.githubAuth.gitHubReturnedAnInvalidAccessTokenResponse"));
    return {
      clientId,
      accessToken,
      ...(expires ? { expiresAt: this.now() + expires * 1000 } : {}),
      ...(refreshToken ? { refreshToken } : {}),
      ...(refreshExpires ? { refreshExpiresAt: this.now() + refreshExpires * 1000 } : {}),
    };
  }

  private requirePending(profileId: string, id: string): Pending {
    const pending = this.pending.get(id);
    if (!pending || pending.profileId !== profileId)
      throw fail(
        errorText(
          "main.providers.githubAuth.thisGitHubSignInWasCancelledOrBelongsToAnotherProfile",
        ),
      );
    if (pending.signIn.expiresAt <= this.now()) {
      this.cancel(profileId, id);
      throw fail(
        errorText("main.providers.githubAuth.theGitHubVerificationCodeExpiredStartSignInAgain"),
      );
    }
    return pending;
  }

  private requireStorage(): void {
    if (!this.secrets.available)
      throw fail(
        errorText("main.providers.githubAuth.secureCredentialStorageIsUnavailableUnlockYourOs"),
        "keychain-unavailable",
      );
  }

  private oauthError(code: unknown): GitError {
    const messages: Record<string, ErrorText> = {
      access_denied: errorText(
        "main.providers.githubAuth.gitHubSignInWasDeclinedStartAgainWhenYouReReady",
      ),
      expired_token: errorText(
        "main.providers.githubAuth.theGitHubVerificationCodeExpiredStartSignInAgain",
      ),
      token_expired: errorText(
        "main.providers.githubAuth.theGitHubVerificationCodeExpiredStartSignInAgain",
      ),
      device_flow_disabled: errorText(
        "main.providers.githubAuth.enableDeviceFlowInEdaSGitHubAppSettingsThenTryAgain",
      ),
      incorrect_client_credentials: errorText(
        "main.providers.githubAuth.edaSGitHubAppClientIdIsInvalidCheckTheAppRegistrationAndRebuild",
      ),
    };
    return fail(
      messages[String(code)] ??
        errorText("main.providers.githubAuth.gitHubCouldNotCompleteSignInStart"),
    );
  }

  private async request(
    url: string,
    form?: Record<string, string>,
    signal?: AbortSignal,
    accessToken?: string,
  ): Promise<Record<string, unknown>> {
    try {
      const response = await this.fetch(url, {
        method: form ? "POST" : "GET",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
          : AbortSignal.timeout(15_000),
        headers: {
          Accept: "application/json",
          "User-Agent": "Eda",
          ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        ...(form ? { body: new URLSearchParams(form).toString() } : {}),
      });
      if ((!response.ok && !(form && response.status === 400)) || !response.body) {
        await response.body?.cancel();
        throw fail(
          response.status === 401
            ? errorText("main.providers.githubAuth.gitHubRejectedThisLoginSignInAgain")
            : errorText("main.providers.githubAuth.gitHubCouldNotCompleteTheRequestCheck"),
          response.status === 401 ? "github-auth-required" : "network-failed",
        );
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 64 * 1024)
            throw fail(
              errorText("main.providers.githubAuth.gitHubSResponseExceededTheSupportedSize"),
            );
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!isRecord(value))
        throw fail(errorText("main.providers.githubAuth.gitHubReturnedAnInvalidResponse"));
      return value;
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw fail(
        errorText(
          "main.providers.githubAuth.couldNotReachGitHubCheckYourConnectionAndTrySigningInAgain",
        ),
        "network-failed",
      );
    }
  }
}

function text(value: unknown): string | undefined {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 4096 &&
    !/[\s\0]/.test(value)
    ? value
    : undefined;
}
function secondsValue(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 366 * 24 * 60 * 60
    ? value
    : undefined;
}
