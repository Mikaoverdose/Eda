import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import { useRef, useState } from "react";
import { ShieldOffIcon } from "../../components/ui/icons";
import { Button, ErrorDialog, TextButton } from "../../components/ui/index";

export function RepositoryTrustButton({
  repositoryId,
  badge = false,
  disabled = false,
  onBusyChange,
}: {
  repositoryId: string;
  badge?: boolean;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const review = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError(null);

    try {
      const result = await window.eda.repository.reviewTrust(repositoryId);
      if (!result.ok) setError(errorMessage(result.error));
    } catch {
      setError(t("main.repositoryTrust.couldNotSendDecision"));
    } finally {
      running.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  return (
    <>
      {badge ? (
        <TextButton
          tone="warning"
          className="inline-flex shrink-0 items-center gap-1.5"
          title={t("repositoryOverview.untrustedDescription")}
          aria-haspopup="dialog"
          aria-busy={busy}
          disabled={disabled || busy}
          onClick={() => void review()}
        >
          <ShieldOffIcon size={13} aria-hidden="true" />
          {t("repositoryOverview.untrusted")}
        </TextButton>
      ) : (
        <Button
          variant="quiet"
          className="mr-auto"
          aria-haspopup="dialog"
          disabled={disabled}
          busy={busy}
          onClick={() => void review()}
        >
          {t("repositoryHome.reviewTrust")}
        </Button>
      )}
      <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
    </>
  );
}
