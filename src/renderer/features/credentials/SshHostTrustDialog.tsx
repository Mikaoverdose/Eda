import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import type { SshHostTrustRequest } from "@shared/identity/ssh";
import { useEffect, useRef, useState } from "react";
import { Button, DefinitionList, Dialog } from "../../components/ui/index";

export function SshHostTrustDialog() {
  const [request, setRequest] = useState<SshHostTrustRequest | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const sending = useRef<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let revision = 0;
    const unsubscribe = window.eda.events.onSshHostTrustChanged((next) => {
      revision++;
      setRequest(next);
    });
    const initialRevision = revision;
    void window.eda.ssh
      .pendingHostTrust()
      .then((result) => {
        if (!disposed && revision === initialRevision && result.ok) setRequest(result.value);
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  if (!request) return null;
  const busy = submitting === request.id;
  const respond = async (trust: boolean) => {
    if (sending.current === request.id) return;
    sending.current = request.id;
    setSubmitting(request.id);
    setFeedback(null);
    try {
      const result = await window.eda.ssh.respondHostTrust(request.id, trust);
      if (result.ok) setRequest((current) => (current?.id === request.id ? null : current));
      else setFeedback({ id: request.id, message: errorMessage(result.error) });
    } catch {
      setFeedback({
        id: request.id,
        message: t("sshHostTrustDialog.couldNotSendYourDecisionTryAgain"),
      });
    } finally {
      if (sending.current === request.id) sending.current = null;
      setSubmitting((current) => (current === request.id ? null : current));
    }
  };

  return (
    <Dialog
      key={request.id}
      title={t("sshHostTrustDialog.trustSshHost")}
      description={t("sshHostTrustDialog.thisServerIsNotTrustedYetCompareIts")}
      onClose={() => void respond(false)}
      footer={
        <>
          <Button autoFocus disabled={busy} onClick={() => void respond(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" busy={busy} onClick={() => void respond(true)}>
            {t("sshHostTrustDialog.trustAndContinue")}
          </Button>
        </>
      }
    >
      <DefinitionList
        items={[
          { label: t("sshHostTrustDialog.host"), value: request.host },
          { label: t("sshHostTrustDialog.keyType"), value: request.algorithm },
          {
            label: t("sshHostTrustDialog.sHa256Fingerprint"),
            value: <code className="selectable text-xs">{request.fingerprint}</code>,
          },
        ]}
      />
      <p className="mt-3 text-xs leading-relaxed text-text-secondary">
        {t("sshHostTrustDialog.trustingSavesThisHostKeyAndContinuesThe")}
      </p>
      {feedback?.id === request.id && (
        <p role="alert" className="mt-3 text-xs text-git-deleted">
          {feedback.message}
        </p>
      )}
    </Dialog>
  );
}
