import { errorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import { isGitHubHttps } from "@shared/integrations/github";
import { isGitLabHttps } from "@shared/integrations/gitlab";
import {
  isGitLabInstanceHttps,
  normalizeGitLabInstanceUrl,
} from "@shared/integrations/gitlab-self-hosted";
import type {
  ProviderRepository,
  ProviderRepositoryPage,
  RepositoryProvider,
} from "@shared/integrations/provider-repositories";
import { isRecord } from "@shared/validation";

export async function listProviderRepositories(
  fetch: typeof globalThis.fetch,
  provider: RepositoryProvider,
  accessToken: string,
  page: number,
  gitlabInstance?: { baseUrl: string; signal?: AbortSignal },
): Promise<ProviderRepositoryPage> {
  const fail = (
    kind: "auth-failed" | "network-failed" | "invalid-input",
    key: "loadFailed" | "invalidResponse" | "signInRequired" | "accessRequired",
  ) =>
    new GitError({
      kind,
      operation: t("main.providerRepositories.operation"),
      message: errorText(`main.providerRepositories.${key}`),
    });

  if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
    throw fail("invalid-input", "invalidResponse");

  if (
    gitlabInstance &&
    (provider !== "gitlab" ||
      normalizeGitLabInstanceUrl(gitlabInstance.baseUrl) !== gitlabInstance.baseUrl)
  )
    throw fail("invalid-input", "invalidResponse");

  const url =
    provider === "github"
      ? `https://api.github.com/user/repos?sort=updated&direction=desc&per_page=50&page=${page}`
      : `${gitlabInstance?.baseUrl ?? "https://gitlab.com"}/api/v4/projects?membership=true&order_by=last_activity_at&sort=desc&per_page=50&page=${page}`;

  try {
    const response = await fetch(url, {
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      signal: gitlabInstance?.signal
        ? AbortSignal.any([gitlabInstance.signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
      headers: {
        Accept: "application/json",
        "User-Agent": "Eda",
        ...(gitlabInstance
          ? { "PRIVATE-TOKEN": accessToken }
          : { Authorization: `Bearer ${accessToken}` }),
      },
    });

    if (!response.ok || !response.body) {
      await response.body?.cancel();

      throw response.status === 401
        ? fail("auth-failed", "signInRequired")
        : response.status === 403
          ? fail("auth-failed", "accessRequired")
          : fail("network-failed", "loadFailed");
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;

    try {
      for (;;) {
        const { value, done } = await reader.read();

        if (done) break;

        length += value.byteLength;

        if (length > 4 * 1024 * 1024) throw fail("network-failed", "invalidResponse");

        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }

    const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));

    if (!Array.isArray(data) || data.length > 50) throw fail("network-failed", "invalidResponse");

    const repositories = data.map((item: unknown): ProviderRepository => {
      if (!isRecord(item)) throw fail("network-failed", "invalidResponse");

      const fullName = provider === "github" ? item["full_name"] : item["path_with_namespace"];
      const cloneUrl = provider === "github" ? item["clone_url"] : item["http_url_to_repo"];
      const validUrl =
        provider === "github"
          ? isGitHubHttps
          : gitlabInstance
            ? (remote: string) => isGitLabInstanceHttps(remote, gitlabInstance.baseUrl)
            : isGitLabHttps;

      if (
        !Number.isSafeInteger(item["id"]) ||
        (item["id"] as number) <= 0 ||
        typeof fullName !== "string" ||
        fullName.length > 1024 ||
        typeof cloneUrl !== "string" ||
        !validUrl(cloneUrl) ||
        typeof item["archived"] !== "boolean" ||
        (provider === "github"
          ? typeof item["private"] !== "boolean"
          : typeof item["visibility"] !== "string")
      )
        throw fail("network-failed", "invalidResponse");

      return {
        id: String(item["id"]),
        name: fullName.split("/").at(-1)!,
        fullName,
        description:
          typeof item["description"] === "string" ? item["description"].slice(0, 2048) : null,
        cloneUrl,
        private:
          provider === "github" ? (item["private"] as boolean) : item["visibility"] !== "public",
        archived: item["archived"],
        updatedAt:
          typeof item[provider === "github" ? "updated_at" : "last_activity_at"] === "string"
            ? (item[provider === "github" ? "updated_at" : "last_activity_at"] as string)
            : null,
      };
    });

    const hasNext =
      provider === "github"
        ? /rel="next"/.test(response.headers.get("link") ?? "")
        : !!response.headers.get("x-next-page");

    return { repositories, nextPage: hasNext && page < 10000 ? page + 1 : null };
  } catch (error) {
    if (error instanceof GitError) throw error;

    throw fail("network-failed", "loadFailed");
  }
}
