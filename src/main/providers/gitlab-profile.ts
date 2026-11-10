import type { GitLabAccountProfile } from "@shared/integrations/gitlab";

export type GitLabProfileDetails = Omit<GitLabAccountProfile, "avatarDataUrl"> & {
  avatarUrl: string | null;
};

export function gitLabProfileDetails(
  id: string,
  user: Record<string, unknown>,
): GitLabProfileDetails {
  return {
    id,
    name: typeof user["name"] === "string" ? user["name"] : null,
    bio: typeof user["bio"] === "string" ? user["bio"] : null,
    location: typeof user["location"] === "string" ? user["location"] : null,
    avatarUrl: typeof user["avatar_url"] === "string" ? user["avatar_url"] : null,
  };
}
