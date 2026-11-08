export const MAINTAINER_GITHUB_LOGIN = "YuzuZensai";

export interface GitHubAccount {
  id: string;
  login: string;
  state: "connected" | "expired" | "revoked";
}

export interface GitHubStatus {
  secureStorage: boolean;
  account: GitHubAccount | null;
}

export interface GitHubAccountProfile {
  id: string;
  login: string;
  name: string | null;
  bio: string | null;
  location: string | null;
  avatarDataUrl: string | null;
}

export interface GitHubSignIn {
  id: string;
  userCode: string;
  expiresAt: number;
  intervalMs: number;
}

export type GitHubSignInResult =
  { state: "pending"; intervalMs: number } | { state: "connected"; status: GitHubStatus };

export function isGitHubHttps(url: string): boolean {
  try {
    const value = new URL(url);
    return (
      value.protocol === "https:" &&
      value.hostname === "github.com" &&
      !value.port &&
      !value.username &&
      !value.password &&
      !value.search &&
      !value.hash &&
      /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(value.pathname)
    );
  } catch {
    return false;
  }
}
