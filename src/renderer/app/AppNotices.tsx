import { StatusBannerStack } from "../components/ui/index";
import { GlobalGitWarning } from "../features/profiles/GlobalGitWarning";
import { AppUpdateNotice } from "../features/updates/AppUpdateNotice";

export function AppNotices({
  aboutOpen,
  onReviewGitSettings,
}: {
  aboutOpen: boolean;
  onReviewGitSettings: () => void;
}) {
  return (
    <StatusBannerStack>
      <GlobalGitWarning onReview={onReviewGitSettings} />

      <AppUpdateNotice aboutOpen={aboutOpen} />
    </StatusBannerStack>
  );
}
