import type { GitLabAccount, GitLabAccountProfile } from "./gitlab";

export type GitLabTokenForm = "legacy" | "granular" | "older";

export interface GitLabSelfHostedAccount extends GitLabAccount {
  baseUrl: string;
  ignoreTlsErrors: boolean;
}

export interface GitLabSelfHostedStatus {
  secureStorage: boolean;
  accounts: GitLabSelfHostedAccount[];
}

export interface GitLabSelfHostedAccountProfile extends GitLabAccountProfile {
  baseUrl: string;
}

export function normalizeGitLabInstanceUrl(input: string): string | null {
  const value = input.trim();

  if (!value || value.length > 2048 || /[\s\\%?#@]/.test(value)) return null;

  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);

    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      !safePath(url.pathname) ||
      /(?:^|\/)\.{1,2}(?:\/|$)/.test(value.replace(/^https:\/\//i, ""))
    )
      return null;

    url.hostname = url.hostname.replace(/\.$/, "");

    if (url.hostname === "gitlab.com") return null;

    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function safePath(path: string): boolean {
  return /^\/(?:[A-Za-z0-9_.~-]+\/?)*$/.test(path);
}

export function isGitLabInstanceHttps(remote: string, baseUrl: string): boolean {
  if (
    normalizeGitLabInstanceUrl(baseUrl) !== baseUrl ||
    /[\s\\%?#]/.test(remote) ||
    /(?:^|\/)\.{1,2}(?:\/|$)/.test(remote)
  )
    return false;

  try {
    const base = new URL(baseUrl);
    const url = new URL(remote);
    const prefix = base.pathname.replace(/\/$/, "") + "/";

    if (
      url.origin !== base.origin ||
      url.username ||
      url.password ||
      !url.pathname.startsWith(prefix)
    )
      return false;

    return /^(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\/?$/.test(url.pathname.slice(prefix.length));
  } catch {
    return false;
  }
}

export function gitLabTokenSettingsUrl(
  baseUrl: string,
  form: GitLabTokenForm = "legacy",
): string | null {
  const normalized = normalizeGitLabInstanceUrl(baseUrl);

  if (!normalized) return null;

  const path = `${normalized}/-/user_settings/personal_access_tokens`;
  const url = new URL(form === "older" ? path : `${path}/${form}/new`);

  if (form !== "granular")
    url.search = new URLSearchParams({
      name: "Eda",
      description: "Eda",
      scopes: "read_api,write_repository",
    }).toString();

  return url.href;
}
