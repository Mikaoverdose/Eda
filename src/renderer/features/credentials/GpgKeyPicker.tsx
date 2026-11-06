import { useId } from "react";
import { t, getLocale } from "@shared/i18n";
import { resolveGpgSelection, type GpgSigningKey } from "@shared/identity/signing";
import { RefreshButton, ErrorDialog, RadioCard, Fingerprint } from "../../components/ui/index";
import { GpgKeyReference } from "./GpgKeyReference";

export function GpgKeyPicker({
  value,
  keys,
  email,
  loading,
  error,
  onChange,
  onRefresh,
  onCommit,
}: {
  value: string;
  keys: GpgSigningKey[];
  email: string;
  loading: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onRefresh: () => Promise<boolean>;
  onCommit?: (value: string) => void;
}) {
  const name = useId();
  const selection = resolveGpgSelection(value, keys);
  const choose = (next: string) => {
    onChange(next);
    onCommit?.(next);
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h3 id={`${name}-label`} className="text-sm font-medium">
          {t("credentials.gpgKeyPicker.gpgSigningKey")}
        </h3>
        <RefreshButton
          label={t("credentials.gpgKeyPicker.refreshGpgKeys")}
          disabled={loading}
          onRefresh={onRefresh}
        />
      </div>
      {!!keys.length && (
        <div
          role="radiogroup"
          aria-labelledby={`${name}-label`}
          aria-busy={loading}
          className="grid min-w-0 gap-3"
        >
          {keys.map((identity) => {
            const owner =
              identity.userIds.find((uid) => email && uid.includes(`<${email}>`)) ||
              identity.userIds[0] ||
              t("credentials.gpgKeyPicker.gpgKey");
            return (
              <section
                key={identity.fingerprint}
                aria-label={owner}
                className="min-w-0 overflow-hidden rounded-md border border-border-subtle bg-bg-surface"
              >
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border-subtle px-3 py-2.5 [overflow-wrap:anywhere]">
                  <h4 className="text-sm font-medium">{owner}</h4>
                  <span className="inline-flex items-center gap-2 text-xs text-text-secondary">
                    {t("credentials.gpgKeyPicker.primaryKey")}
                    <Fingerprint value={identity.fingerprint} shortValue={identity.keyId} />
                  </span>
                </div>
                <div className="divide-y divide-border-subtle">
                  <RadioCard
                    variant="row"
                    name={name}
                    value={identity.fingerprint}
                    checked={selection?.identity === identity && !selection.signer}
                    onChange={choose}
                  >
                    <span
                      className="radio-control shrink-0"
                      data-checked={selection?.identity === identity && !selection.signer}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 space-y-1">
                      <span className="block text-sm font-medium">
                        {t("credentials.gpgKeyPicker.automatic")}
                      </span>
                      <span className="block text-xs leading-relaxed text-text-secondary">
                        {t("credentials.gpgKeyPicker.automaticDescription")}
                      </span>
                    </span>
                  </RadioCard>
                  {identity.signingKeys.map((signer) => {
                    const checked = selection?.identity === identity && selection.signer === signer;
                    return (
                      <RadioCard
                        variant="row"
                        key={signer.fingerprint}
                        name={name}
                        value={`${signer.fingerprint}!`}
                        checked={checked}
                        onChange={choose}
                        actions={
                          <Fingerprint
                            value={signer.fingerprint}
                            shortValue={signer.fingerprint.slice(-16)}
                          />
                        }
                      >
                        <span
                          className="radio-control shrink-0"
                          data-checked={checked}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
                          <span className="block text-sm font-medium">
                            {t(
                              signer.fingerprint === identity.fingerprint
                                ? "credentials.gpgKeyPicker.exactPrimary"
                                : "credentials.gpgKeyPicker.exactSubkey",
                            )}
                          </span>
                          <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-secondary">
                            <span>{expiry(signer.expiresAt)}</span>
                          </span>
                        </span>
                      </RadioCard>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {loading && keys.length === 0 ? (
        <p role="status" className="text-xs text-text-secondary">
          {t("credentials.gpgKeyPicker.lookingForGpgSigningKeys")}
        </p>
      ) : (
        <>
          <ErrorDialog>{error}</ErrorDialog>
          {!error && !keys.length && (
            <p role="status" className="text-xs text-text-secondary">
              {t("credentials.gpgKeyPicker.noUsableGpgSigningKeysFoundCreateOr")}
            </p>
          )}
          {value && !selection && (
            <p className="text-xs text-git-modified">
              {t("credentials.gpgKeyPicker.theConfiguredKeyWasNotDetectedAsA")}
            </p>
          )}
        </>
      )}
      {value && !selection && (
        <div className="space-y-2 rounded-md border border-border-subtle p-3">
          <p className="text-xs text-text-secondary">
            {t("credentials.gpgKeyPicker.savedSelection")}
          </p>
          <GpgKeyReference value={value} keys={keys} />
        </div>
      )}
    </>
  );
}

function expiry(expiresAt: number | null): string {
  return expiresAt
    ? t("credentials.gpgKeyPicker.signerExpires", {
        date: new Date(expiresAt * 1000).toLocaleDateString(getLocale()),
      })
    : t("credentials.gpgKeyPicker.signerNoExpiration");
}
