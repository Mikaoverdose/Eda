import github from "../../assets/providers/github.svg";
import gitlab from "../../assets/providers/gitlab.svg";
import bitbucket from "../../assets/providers/bitbucket.svg";
import azureDevOps from "../../assets/providers/azuredevops.svg";
import { cx } from "../../components/ui/cx";

const PROVIDERS = {
  GitHub: { icon: github, color: "text-text-primary" },
  GitLab: { icon: gitlab, color: "text-[#fc6d26]" },
  Bitbucket: { icon: bitbucket, color: "text-[#2684ff]" },
  "Azure DevOps": { icon: azureDevOps, color: "text-[#2684ff]" },
} as const;

export type HostingProvider = keyof typeof PROVIDERS;

export function ProviderIcon({ provider }: { provider: HostingProvider }) {
  const { icon, color } = PROVIDERS[provider];
  const mask = `url("${icon}") center / contain no-repeat`;
  return (
    <span
      aria-hidden="true"
      className={cx("inline-block size-4 shrink-0 bg-current", color)}
      style={{ mask, WebkitMask: mask }}
    />
  );
}
