import { errorText, type ErrorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import {
  isGitHubHttps,
  type GitHubAccountProfile,
  type GitHubRepositoryAccess,
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
import { GitHubInstallationCallback } from "./github-installation-callback";

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
  private readonly installationListeners = new Set<(profileId: string) => void>();
  private readonly installationCallback = new GitHubInstallationCallback(
    (profileId) => {
      if (!this.authorized.has(profileId) && this.accounts.find(profileId)?.state !== "connected")
        return;
      for (const listener of this.installationListeners) listener(profileId);
    },
    () => this.now(),
  );
  private readonly authorized = new Map<string, Authorized>();
  private readonly committing = new Map<string, Promise<void>>();
  private readonly pending = new Map<string, Pending>();
  private readonly refreshing = new Map<string, Promise<Tokens>>();
  private readonly profiles = new Map<
    string,
    { value: Omit<GitHubAccountProfile, "avatarDataUrl">; expiresAt: number }
  >();

  constructor(
    private readonly accounts: GitHubAccountRepository,
    private readonly secrets: SecretStore,
    private readonly clientId: string,
    private readonly fetch: typeof globalThis.fetch,
    private readonly now = Date.now,
    private readonly appSlug = "",
  ) {}

  status(profileId: string): GitHubStatus {
    const account = this.accounts.find(profileId);
    return {
      configured: /^[A-Za-z0-9_.-]{1,128}$/.test(this.clientId),
      secureStorage: this.secrets.available,
      installationAvailable: /^[a-z0-9][a-z0-9-]{0,99}$/.test(this.appSlug),
      pendingAccountId: this.authorized.get(profileId)?.accountId ?? null,
      account:
        account && !this.authorized.has(profileId)
          ? { id: account.accountId, login: account.login, state: account.state }
          : null,
    };
  }

  async profile(profileId: string): Promise<Omit<GitHubAccountProfile, "avatarDataUrl"> | null> {
    const account = this.accounts.find(profileId);
    if (this.authorized.has(profileId)) return null;
    if (!account || !/^[1-9][0-9]{0,15}$/.test(account.accountId)) return null;
    const cached = this.profiles.get(account.accountId);
    if (cached && cached.expiresAt > this.now()) return cached.value;
    const fallback = cached?.value ?? {
      id: account.accountId,
      login: account.login,
      name: null,
      bio: null,
      location: null,
    };
    let value = fallback;
    let ttl = 60_000;
    try {
      const user = await this.request(`https://api.github.com/user/${account.accountId}`);
      if (
        !Number.isSafeInteger(user["id"]) ||
        String(user["id"]) !== account.accountId ||
        !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(text(user["login"]) ?? "")
      )
        throw fail(errorText("main.providers.githubAuth.gitHubReturnedADifferentAccountProfile"));
      const field = (key: string, limit: number) =>
        typeof user[key] === "string"
          ? user[key]
              .replace(/[\u0000-\u001f\u007f]/g, " ")
              .trim()
              .slice(0, limit) || null
          : null;
      value = {
        id: account.accountId,
        login: user["login"] as string,
        name: field("name", 128),
        bio: field("bio", 160),
        location: field("location", 128),
      };
      ttl = 5 * 60_000;
    } catch {}
    this.profiles.delete(account.accountId);
    this.profiles.set(account.accountId, { value, expiresAt: this.now() + ttl });
    while (this.profiles.size > 128) this.profiles.delete(this.profiles.keys().next().value!);
    return value;
  }

  profileUrl(profileId: string): string {
    const account = this.accounts.find(profileId);
    if (!account || this.authorized.has(profileId))
      throw fail(errorText("main.providers.githubAuth.connectAGitHubAccountFirst"));
    const login = this.profiles.get(account.accountId)?.value.login ?? account.login;
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(login))
      throw fail(errorText("main.providers.githubAuth.theGitHubAccountProfileIsInvalid"));
    return `https://github.com/${login}`;
  }

  async repositoryAccess(profileId: string): Promise<GitHubRepositoryAccess> {
    const account = this.accounts.find(profileId);
    const authorized = this.authorized.get(profileId);
    if (!account && !authorized)
      throw fail(
        errorText("main.providers.githubAuth.signInWithGitHubFirst"),
        "github-auth-required",
      );
    if (authorized?.tokens.expiresAt !== undefined && authorized.tokens.expiresAt <= this.now()) {
      this.authorized.delete(profileId);
      throw fail(
        errorText("main.providers.githubAuth.yourGitHubLoginExpiredSignInAgain"),
        "github-auth-required",
      );
    }
    const accessToken = authorized
      ? authorized.tokens.accessToken
      : (await this.credentials(account!)).password;
    const valid = () =>
      authorized
        ? this.authorized.get(profileId) === authorized
        : this.accounts.find(profileId)?.credentialRef === account!.credentialRef &&
          !this.authorized.has(profileId);
    const accounts = new Set<string>();
    for (let page = 1; page <= 10; page++) {
      let response: Record<string, unknown>;
      try {
        response = await this.request(
          `https://api.github.com/user/installations?per_page=10&page=${page}`,
          undefined,
          undefined,
          accessToken,
        );
      } catch (error) {
        if (error instanceof GitError && error.kind === "github-auth-required") {
          if (authorized) {
            if (valid()) this.authorized.delete(profileId);
          } else return this.expired(account!);
        }
        throw error;
      }
      if (!valid())
        throw fail(
          errorText("main.providers.githubAuth.theGitHubAccountChangedCheckAccessAgain"),
          "github-auth-required",
        );
      const installations = response["installations"];
      const total = response["total_count"];
      if (
        !Array.isArray(installations) ||
        installations.length > 10 ||
        !Number.isSafeInteger(total) ||
        (total as number) < installations.length
      )
        throw fail(
          errorText("main.providers.githubAuth.gitHubReturnedInvalidRepositoryAccessDetails"),
        );
      for (const value of installations) {
        if (!value || typeof value !== "object")
          throw fail(
            errorText("main.providers.githubAuth.gitHubReturnedInvalidRepositoryAccessDetails"),
          );
        const installation = value as Record<string, unknown>;
        const owner = installation["account"] as Record<string, unknown> | null;
        const permissions = installation["permissions"] as Record<string, unknown> | null;
        if (
          installation["suspended_at"] === null &&
          ["read", "write"].includes(String(permissions?.["contents"])) &&
          typeof owner?.["login"] === "string" &&
          /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner["login"])
        )
          accounts.add(owner["login"]);
      }
      if (page * 10 >= (total as number)) {
        if (authorized && accounts.size) await this.commit(authorized);
        return {
          accountId: authorized?.accountId ?? account!.accountId,
          accounts: [...accounts].sort(),
        };
      }
      if (installations.length !== 10)
        throw fail(
          errorText(
            "main.providers.githubAuth.gitHubReturnedIncompleteRepositoryAccessDetailsCheckAccessAgain",
          ),
        );
    }
    throw fail(
      errorText(
        "main.providers.githubAuth.thereAreTooManyGitHubInstallationsToVerifyManageAccessOnGitHub",
      ),
    );
  }

  async begin(profileId: string): Promise<GitHubSignIn> {
    this.requireStorage();
    if (!this.status(profileId).configured)
      throw fail(errorText("main.providers.githubAuth.gitHubSignInIsNotConfiguredIn"));
    this.cancelProfile(profileId);
    for (const [id, pending] of this.pending)
      if (pending.signIn.expiresAt <= this.now()) this.cancel(pending.profileId, id);
    if (this.pending.size >= 16)
      throw fail(
        errorText("main.providers.githubAuth.tooManyGitHubSignInsArePendingCancelOneAndTryAgain"),
      );
    const response = await this.request(DEVICE_URL, {
      client_id: this.clientId,
      scope: "offline_access",
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
      return { state: "authorized", status: this.status(profileId) };
    } catch (error) {
      this.cancel(profileId, id);
      throw error;
    }
  }

  verifyPending(profileId: string, id: string): string {
    return this.requirePending(profileId, id).signIn.userCode;
  }

  installationUrl(state?: string, accountId?: string): string {
    if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(this.appSlug))
      throw fail(
        errorText(
          "main.providers.githubAuth.theGitHubAppInstallationLinkIsNotConfiguredInThisBuild",
        ),
      );
    const url = new URL(`https://github.com/apps/${this.appSlug}/installations/new`);
    if (accountId) {
      if (!/^[1-9][0-9]{0,15}$/.test(accountId))
        throw fail(errorText("main.providers.githubAuth.theGitHubAccountIdentityIsInvalid"));
      url.pathname += "/permissions";
      url.searchParams.set("target_id", accountId);
      url.searchParams.set("target_type", "User");
    }
    if (state) url.searchParams.set("state", state);
    return url.toString();
  }

  async startInstallation(profileId: string): Promise<string> {
    const status = this.status(profileId);
    const accountId =
      status.pendingAccountId ??
      (status.account?.state === "connected" ? status.account.id : undefined);
    if (!accountId)
      throw fail(
        errorText("main.providers.githubAuth.signInWithGitHubFirst"),
        "github-auth-required",
      );
    const url = this.installationUrl(undefined, accountId);
    try {
      return this.installationUrl(await this.installationCallback.begin(profileId), accountId);
    } catch {
      return url;
    }
  }

  onInstallationChanged(listener: (profileId: string) => void): () => void {
    this.installationListeners.add(listener);
    return () => this.installationListeners.delete(listener);
  }

  cancel(profileId: string, id: string): void {
    if (this.authorized.get(profileId)?.signInId === id) {
      this.authorized.delete(profileId);
      this.installationCallback.cancel(profileId);
    }
    const pending = this.pending.get(id);
    if (pending?.profileId !== profileId) return;
    pending.controller.abort();
    this.pending.delete(id);
  }

  cancelProfile(profileId: string): void {
    this.authorized.delete(profileId);
    this.installationCallback.cancel(profileId);
    for (const [id, pending] of this.pending)
      if (pending.profileId === profileId) this.cancel(profileId, id);
  }

  cancelAll(): void {
    this.authorized.clear();
    this.installationCallback.close();
    for (const [id, pending] of this.pending) this.cancel(pending.profileId, id);
  }

  async reset(): Promise<void> {
    this.cancelAll();
    await Promise.allSettled([...this.committing.values(), ...this.refreshing.values()]);
    this.profiles.clear();
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
      secretKeys.provider(profileId, "github", "github.com", accountId) + ":" + randomUUID();
    await this.secrets.set(credentialRef, JSON.stringify(tokens));
    try {
      if (this.authorized.get(profileId) !== candidate)
        throw fail(
          errorText("main.providers.githubAuth.theGitHubConnectionWasCancelledSignInAgain"),
          "github-auth-required",
        );
      this.accounts.save({ profileId, accountId, login, credentialRef, state: "connected" });
      this.authorized.delete(profileId);
      this.installationCallback.cancel(profileId);
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
      if (value && typeof value === "object") {
        const token = value as Record<string, unknown>;
        if (
          text(token["accessToken"]) &&
          text(token["clientId"]) &&
          (token["expiresAt"] === undefined || Number.isSafeInteger(token["expiresAt"])) &&
          (token["refreshToken"] === undefined || text(token["refreshToken"])) &&
          (token["refreshExpiresAt"] === undefined ||
            Number.isSafeInteger(token["refreshExpiresAt"]))
        )
          return token as unknown as Tokens;
      }
    } catch {}
    return this.expired(account);
  }

  private ownsCredential(account: SavedGitHubAccount): boolean {
    return account.credentialRef.startsWith(
      secretKeys.provider(account.profileId, "github", "github.com", account.accountId) + ":",
    );
  }

  private tokens(response: Record<string, unknown>, clientId: string): Tokens {
    const accessToken = text(response["access_token"]);
    const refreshToken = text(response["refresh_token"]);
    const expires = secondsValue(response["expires_in"]);
    const refreshExpires = secondsValue(response["refresh_token_expires_in"]);
    if (
      !accessToken?.startsWith("ghu_") ||
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
        // Avoid cached API responses from before the GitHub App was installed.
        cache: "no-store",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
          : AbortSignal.timeout(15_000),
        headers: {
          Accept: "application/json",
          "User-Agent": "Eda",
          ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
          ...(accessToken
            ? { Authorization: t("main.providers.githubAuth.bearer", { accessToken: accessToken }) }
            : {}),
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
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw fail(errorText("main.providers.githubAuth.gitHubReturnedAnInvalidResponse"));
      return value as Record<string, unknown>;
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
