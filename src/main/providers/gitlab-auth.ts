import { errorText, type ErrorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import { isRecord } from "@shared/validation";
import { INTEGRATIONS } from "@shared/integrations/config";
import {
  isGitLabHttps,
  type GitLabSignIn,
  type GitLabSignInResult,
  type GitLabStatus,
} from "@shared/integrations/gitlab";
import type { TransportCredentials } from "@shared/integrations/remotes";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  GitLabAccountRepository,
  SavedGitLabAccount,
} from "../persistence/gitlab-account-repository";
import { secretKeys, type SecretStore } from "../secrets/secret-store";
import { ProviderProfileCache } from "./provider-profile-cache";
import { GitLabOAuthCallback } from "./gitlab-oauth-callback";

type ProfileDetails = { id: string; avatarUrl: string | null };

const TOKEN_URL = "https://gitlab.com/oauth/token";
const USER_URL = "https://gitlab.com/api/v4/user";
const fail = (
  message: ErrorText,
  kind:
    "invalid-input" | "network-failed" | "auth-failed" | "keychain-unavailable" = "invalid-input",
) => new GitError({ kind, operation: t("operations.gitLabSignIn"), message });

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
  controller: AbortController;
  signIn: GitLabSignIn;
  callback: GitLabOAuthCallback;
  verifier: string;
  authorizationUrl: string;
  result?: GitLabStatus;
  error?: unknown;
}

export class GitLabAuth {
  private readonly profiles: ProviderProfileCache<ProfileDetails>;
  private readonly clientId = INTEGRATIONS.gitlab.clientId;
  private readonly authorized = new Map<string, Authorized>();
  private readonly committing = new Map<string, Promise<void>>();
  private readonly pending = new Map<string, Pending>();
  private readonly refreshing = new Map<string, Promise<Tokens>>();

  constructor(
    private readonly accounts: GitLabAccountRepository,
    private readonly secrets: SecretStore,
    private readonly fetch: typeof globalThis.fetch,
    private readonly now = Date.now,
  ) {
    this.profiles = new ProviderProfileCache(now);
  }

  status(profileId: string): GitLabStatus {
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

  async profile(profileId: string): Promise<ProfileDetails | null> {
    const account = this.accounts.find(profileId);
    if (!account || !this.ownsCredential(account) || this.authorized.has(profileId)) return null;
    const details = await this.profiles.get(account.credentialRef, async () => {
      const credentials = await this.credentials(account);
      const user = await this.request(USER_URL, undefined, undefined, credentials.password);
      if (
        String(user["id"]) !== account.accountId ||
        this.accounts.find(profileId)?.credentialRef !== account.credentialRef
      )
        return null;
      return {
        id: account.accountId,
        avatarUrl: typeof user["avatar_url"] === "string" ? user["avatar_url"] : null,
      };
    });
    return this.accounts.find(profileId)?.credentialRef === account.credentialRef ? details : null;
  }

  profileUrl(profileId: string): string {
    const account = this.accounts.find(profileId);
    if (!account || !this.ownsCredential(account) || this.authorized.has(profileId))
      throw fail(errorText("main.providers.gitlabAuth.connectAGitLabAccountFirst"));
    const login = account.login;
    if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,254}$/.test(login))
      throw fail(errorText("main.providers.gitlabAuth.theGitLabAccountProfileIsInvalid"));
    return `https://gitlab.com/${login}`;
  }

  async begin(profileId: string): Promise<GitLabSignIn> {
    this.requireStorage();
    this.cancelAll();
    const signIn = { id: randomUUID(), expiresAt: this.now() + 10 * 60_000 };
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const callback = new GitLabOAuthCallback(
      INTEGRATIONS.gitlab.redirectUri,
      state,
      (code, error) => {
        const session = this.pending.get(signIn.id);
        if (!session) return;
        if (!code || error) {
          session.error = fail(errorText("main.providers.gitlabAuth.signInDeclined"));
          return;
        }
        void this.finish(session, code).catch((error: unknown) => {
          session.error = error;
        });
      },
    );
    const session: Pending = {
      profileId,
      controller: new AbortController(),
      signIn,
      callback,
      verifier,
      authorizationUrl: "",
    };
    this.pending.set(signIn.id, session);
    try {
      await callback.listen();
      this.requirePending(profileId, signIn.id);
      const url = new URL("https://gitlab.com/oauth/authorize");
      url.search = new URLSearchParams({
        client_id: this.clientId,
        redirect_uri: INTEGRATIONS.gitlab.redirectUri,
        response_type: "code",
        state,
        scope: "read_user write_repository",
        code_challenge: createHash("sha256").update(verifier).digest("base64url"),
        code_challenge_method: "S256",
      }).toString();
      session.authorizationUrl = url.href;
      return signIn;
    } catch (error) {
      this.cancel(profileId, signIn.id);
      throw error;
    }
  }

  poll(profileId: string, id: string): GitLabSignInResult {
    const session = this.requirePending(profileId, id);
    if (session.error) {
      this.cancel(profileId, id);
      throw session.error;
    }
    if (session.result) {
      this.cancel(profileId, id);
      return { state: "connected", status: session.result };
    }
    return { state: "pending" };
  }

  authorizationUrl(profileId: string, id: string): string {
    return this.requirePending(profileId, id).authorizationUrl;
  }

  private async finish(session: Pending, code: string): Promise<void> {
    const { profileId, signIn, controller } = session;
    const response = await this.request(
      TOKEN_URL,
      {
        client_id: this.clientId,
        code,
        grant_type: "authorization_code",
        redirect_uri: INTEGRATIONS.gitlab.redirectUri,
        code_verifier: session.verifier,
      },
      controller.signal,
    );
    if (response["error"]) throw this.oauthError(response["error"]);
    const tokens = this.tokens(response, this.clientId);
    const user = await this.request(USER_URL, undefined, controller.signal, tokens.accessToken);
    if (
      !Number.isSafeInteger(user["id"]) ||
      (user["id"] as number) <= 0 ||
      !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,254}$/.test(text(user["username"]) ?? "")
    )
      throw fail(errorText("main.providers.gitlabAuth.gitLabReturnedAnInvalidAccountIdentity"));
    this.requirePending(profileId, signIn.id);
    const candidate: Authorized = {
      signInId: signIn.id,
      profileId,
      accountId: String(user["id"]),
      login: user["username"] as string,
      tokens,
    };
    this.authorized.set(profileId, candidate);
    await this.commit(candidate);
    this.requirePending(profileId, signIn.id);
    const account = this.accounts.find(profileId);
    if (account?.accountId === candidate.accountId)
      this.profiles.set(account.credentialRef, {
        id: candidate.accountId,
        avatarUrl: typeof user["avatar_url"] === "string" ? user["avatar_url"] : null,
      });
    session.result = this.status(profileId);
  }

  cancel(profileId: string, id: string): void {
    if (this.authorized.get(profileId)?.signInId === id) {
      this.authorized.delete(profileId);
    }
    const pending = this.pending.get(id);
    if (pending?.profileId !== profileId) return;
    pending.controller.abort();
    pending.callback.close();
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
    this.profiles.delete(account.credentialRef);
  }

  async forFetch(profileId: string, url: string): Promise<TransportCredentials | undefined> {
    if (!isGitLabHttps(url)) return undefined;
    if (this.authorized.has(profileId))
      throw fail(
        errorText("main.providers.gitlabAuth.finishConnectingGitLabInProfileSettingsThenRetry"),
        "auth-failed",
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
      secretKeys.provider(profileId, "gitlab-oauth", "gitlab.com", accountId) + ":" + randomUUID();
    await this.secrets.set(credentialRef, JSON.stringify(tokens));
    try {
      if (this.authorized.get(profileId) !== candidate)
        throw fail(
          errorText("main.providers.gitlabAuth.theGitLabConnectionWasCancelledSignInAgain"),
          "auth-failed",
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

  private async credentials(account: SavedGitLabAccount): Promise<TransportCredentials> {
    this.requireStorage();
    if (account.state !== "connected")
      throw fail(
        errorText("main.providers.gitlabAuth.reconnectGitLabInTheIntegrationsSectionOf"),
        "auth-failed",
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
    if (this.accounts.find(account.profileId)?.credentialRef !== account.credentialRef)
      throw fail(
        errorText("main.providers.gitlabAuth.theGitLabAccountChangedRetryThePull"),
        "auth-failed",
      );
    return { username: "oauth2", password: tokens.accessToken };
  }

  private async refresh(account: SavedGitLabAccount, tokens: Tokens): Promise<Tokens> {
    if (
      !tokens.refreshToken ||
      (tokens.refreshExpiresAt !== undefined && tokens.refreshExpiresAt <= this.now())
    )
      return this.expired(account);
    const response = await this.request(TOKEN_URL, {
      client_id: tokens.clientId,
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      redirect_uri: INTEGRATIONS.gitlab.redirectUri,
    });
    if (response["error"]) {
      if (
        ["bad_refresh_token", "expired_token", "invalid_grant"].includes(String(response["error"]))
      )
        return this.expired(account);
      throw this.oauthError(response["error"]);
    }
    const refreshed = this.tokens(response, tokens.clientId);
    const user = await this.request(USER_URL, undefined, undefined, refreshed.accessToken);
    if (String(user["id"]) !== account.accountId) return this.expired(account);
    const current = this.accounts.find(account.profileId);
    if (current?.credentialRef !== account.credentialRef)
      throw fail(
        errorText("main.providers.gitlabAuth.theGitLabAccountChangedRetryThePull"),
        "auth-failed",
      );
    await this.secrets.set(account.credentialRef, JSON.stringify(refreshed));
    this.profiles.set(account.credentialRef, {
      id: account.accountId,
      avatarUrl: typeof user["avatar_url"] === "string" ? user["avatar_url"] : null,
    });
    return refreshed;
  }

  private expired(account: SavedGitLabAccount): never {
    if (this.accounts.find(account.profileId)?.credentialRef === account.credentialRef)
      this.accounts.save({ ...account, state: "expired" });
    throw fail(
      errorText("main.providers.gitlabAuth.yourGitLabLoginExpiredReconnectGitLabThenRetryThePull"),
      "auth-failed",
    );
  }

  private async readTokens(account: SavedGitLabAccount): Promise<Tokens> {
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
          accessToken &&
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

  private ownsCredential(account: SavedGitLabAccount): boolean {
    return account.credentialRef.startsWith(
      secretKeys.provider(account.profileId, "gitlab-oauth", "gitlab.com", account.accountId) + ":",
    );
  }

  private tokens(response: Record<string, unknown>, clientId: string): Tokens {
    const accessToken = text(response["access_token"]);
    const refreshToken = text(response["refresh_token"]);
    const expires = secondsValue(response["expires_in"]);
    const refreshExpires = secondsValue(response["refresh_token_expires_in"]);
    if (
      !accessToken ||
      !refreshToken ||
      !expires ||
      typeof response["token_type"] !== "string" ||
      response["token_type"].toLowerCase() !== "bearer" ||
      (response["expires_in"] !== undefined && !expires) ||
      (response["refresh_token"] !== undefined && !refreshToken) ||
      (response["refresh_token_expires_in"] !== undefined && !refreshExpires)
    )
      throw fail(errorText("main.providers.gitlabAuth.gitLabReturnedAnInvalidAccessTokenResponse"));
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
          "main.providers.gitlabAuth.thisGitLabSignInWasCancelledOrBelongsToAnotherProfile",
        ),
      );
    if (!pending.result && pending.signIn.expiresAt <= this.now()) {
      this.cancel(profileId, id);
      throw fail(
        errorText("main.providers.gitlabAuth.theGitLabVerificationCodeExpiredStartSignInAgain"),
      );
    }
    return pending;
  }

  private requireStorage(): void {
    if (!this.secrets.available)
      throw fail(
        errorText("main.providers.gitlabAuth.secureCredentialStorageIsUnavailableUnlockYourOs"),
        "keychain-unavailable",
      );
  }

  private oauthError(_code: unknown): GitError {
    return fail(errorText("main.providers.gitlabAuth.gitLabCouldNotCompleteSignInStart"));
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
            ? errorText("main.providers.gitlabAuth.gitLabRejectedThisLoginSignInAgain")
            : errorText("main.providers.gitlabAuth.gitLabCouldNotCompleteTheRequestCheck"),
          response.status === 401 ? "auth-failed" : "network-failed",
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
              errorText("main.providers.gitlabAuth.gitLabSResponseExceededTheSupportedSize"),
            );
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!isRecord(value))
        throw fail(errorText("main.providers.gitlabAuth.gitLabReturnedAnInvalidResponse"));
      return value;
    } catch (error) {
      if (error instanceof GitError) throw error;
      throw fail(
        errorText(
          "main.providers.gitlabAuth.couldNotReachGitLabCheckYourConnectionAndTrySigningInAgain",
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
