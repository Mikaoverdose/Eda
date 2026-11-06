import { t } from "@shared/i18n";
import { profileGitConfig, type Identity } from "@shared/identity/identity";
import type { GitConfigEntry } from "@shared/identity/profile-session";

export function simulatedGitConfig(profile: Identity, matched: boolean): GitConfigEntry[] {
  const values = {
    ...profileGitConfig(profile),
    ...(!matched && {
      "user.name": `${profile.gitName} (${t("settings.stateSimulations.differentIdentity")})`,
      "user.email": `simulation+${profile.gitEmail}`,
    }),
  };

  return Object.entries(values).map(([key, value]) => ({
    key,
    ...(value === undefined ? {} : { value }),
    scope: "global",
    origin: t("settings.stateSimulations.simulatedConfiguration"),
  }));
}
