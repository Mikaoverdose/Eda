import { t } from "@shared/i18n";
import { openSettings } from "../../stores/shell-store";
import { Button, Dialog } from "../../components/ui/index";

export function GitHubSignInDialog({
  onClose,
  accessDenied = false,
}: {
  onClose: () => void;
  accessDenied?: boolean;
}) {
  return (
    <Dialog
      title={
        accessDenied
          ? t("gitHubSignInDialog.enableGitHubRepositoryAccess")
          : t("gitHubSignInDialog.signInWithGitHub")
      }
      description={
        accessDenied
          ? t("gitHubSignInDialog.gitHubDeniedAccessToThisRepositoryOpen")
          : t("gitHubSignInDialog.openSettingsProfileIntegrationsToSignInAnd")
      }
      onClose={onClose}
      children={null}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>

          <Button
            variant="primary"
            onClick={() => {
              onClose();
              openSettings("integrations");
            }}
          >
            {t("gitHubSignInDialog.openSettings")}
          </Button>
        </>
      }
    />
  );
}
