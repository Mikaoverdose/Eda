import type { TransportCredentials } from "@shared/integrations/remotes";
import { t } from "@shared/i18n";
import { useId, useState } from "react";
import { Button, Dialog, NoticeBanner } from "../../components/ui/index";
import { CredentialFields } from "./TransportFields";

export function HttpsAuthenticationDialog({
  title,
  description,
  submitLabel,
  error,
  busy,
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  submitLabel: string;
  error: string | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (credentials: TransportCredentials) => void;
}) {
  const formId = useId();
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const canSubmit = !!credentials.username.trim() && !!credentials.password && !busy;

  return (
    <Dialog
      title={title}
      description={description}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={!canSubmit} busy={busy}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;

          setCredentials({ username: "", password: "" });
          onSubmit(credentials);
        }}
      >
        {error && <NoticeBanner tone="error">{error}</NoticeBanner>}
        <CredentialFields value={credentials} onChange={setCredentials} disabled={busy} />
      </form>
    </Dialog>
  );
}
