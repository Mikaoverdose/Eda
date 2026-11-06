import { errorMessage } from "@shared/errors";
import { t, type MessageKey } from "@shared/i18n";
import type { TransportCredentials } from "@shared/integrations/remotes";
import type { OperationRecord } from "@shared/operations";
import { useEffect, useState } from "react";
import {
  Button,
  CodeBlock,
  Disclosure,
  ErrorDialog,
  Field,
  Input,
} from "../../components/ui/index";

interface CredentialFieldsProps {
  value: TransportCredentials;
  onChange: (value: TransportCredentials) => void;
  disabled: boolean;
}

export function CredentialFields({
  value,
  onChange,
  disabled,
  shortLabels = false,
}: CredentialFieldsProps & { shortLabels?: boolean }) {
  return (
    <>
      <Field label={t("transportFields.username")}>
        {(field) => (
          <Input
            {...field}
            aria-label={shortLabels ? undefined : t("transportFields.hTtpsUsername")}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={disabled}
            placeholder={t("transportFields.yourGitUsername")}
            value={value.username}
            onChange={(event) => onChange({ ...value, username: event.target.value })}
          />
        )}
      </Field>
      <Field label={t("transportFields.accessToken")}>
        {(field) => (
          <Input
            {...field}
            aria-label={shortLabels ? undefined : t("transportFields.hTtpsToken")}
            type="password"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            placeholder={t("transportFields.pasteYourAccessToken")}
            value={value.password}
            onChange={(event) => onChange({ ...value, password: event.target.value })}
          />
        )}
      </Field>
    </>
  );
}

export function TransportFields({ value, onChange, disabled }: CredentialFieldsProps) {
  return (
    <Disclosure
      title={t("transportFields.hTtpsAuthentication")}
      className="rounded border border-border-subtle p-3 text-xs"
    >
      <div className="mt-3 space-y-3">
        <p className="text-text-tertiary">
          {t("transportFields.forPrivateHttpsRepositoriesEnterYourUsernameAnd")}
        </p>
        <CredentialFields value={value} onChange={onChange} disabled={disabled} />
      </div>
    </Disclosure>
  );
}

export function TransferProgress({
  repositoryId,
  kindKey,
}: {
  repositoryId?: string;
  kindKey: MessageKey;
}) {
  const [record, setRecord] = useState<OperationRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const result = await window.eda.operations.list();

      if (alive && result.ok)
        setRecord(
          result.value.find(
            (item) =>
              item.kindKey === kindKey &&
              (!repositoryId || item.repositoryId === repositoryId) &&
              item.cancellable,
          ) ?? null,
        );
    };

    void load();

    const unsubscribe = window.eda.events.onOperationsChanged(() => void load());

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [repositoryId, kindKey]);

  return (
    <div role="status" className="space-y-2 text-xs text-text-secondary">
      <p>{record?.message ?? t("transportFields.preparingOperation")}</p>
      {record?.output && (
        <CodeBlock label={t("transportFields.transferOutput")} wrap className="max-h-32">
          {record.output}
        </CodeBlock>
      )}
      {record && (
        <Button
          size="sm"
          onClick={() =>
            void window.eda.operations.cancel(record.id).then((result) => {
              if (!result.ok) setError(errorMessage(result.error));
            })
          }
        >
          {t("common.cancelOperation")}
        </Button>
      )}
      {error && <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>}
    </div>
  );
}
