import { isGitLabInstanceHttps } from "../integrations/gitlab-self-hosted";

export type ReferenceLinkKind = "commit" | "branch" | "remote-branch" | "tag";

export function referenceLink(
  remote: string,
  kind: ReferenceLinkKind,
  name: string,
  gitlabInstances: readonly string[] = [],
): string | null {
  try {
    const input = remote.replace(/^git@([^:]+):/, "https://$1/");
    const url = new URL(input);

    const selfHosted =
      url.protocol === "https:" &&
      gitlabInstances.some((baseUrl) => isGitLabInstanceHttps(input, baseUrl));

    if (
      !["https:", "ssh:"].includes(url.protocol) ||
      (url.port && !selfHosted) ||
      /[\x00-\x20]/.test(name)
    )
      return null;

    const path = url.pathname.replace(/\.git\/?$/, "").replace(/\/$/, "");

    if (!/^\/[\w.-]+\/[\w./-]+$/.test(path)) return null;

    const ref = encodeURIComponent(name);

    const route =
      url.hostname === "github.com"
        ? `${kind === "commit" ? "commit" : "tree"}/${ref}`
        : url.hostname === "gitlab.com" || selfHosted
          ? `-/${kind === "commit" ? "commit" : "tree"}/${ref}`
          : url.hostname === "bitbucket.org"
            ? `${kind === "commit" ? "commits" : "src"}/${ref}`
            : null;

    return route ? `https://${url.host}${path}/${route}` : null;
  } catch {
    return null;
  }
}
