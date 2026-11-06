import { t } from "@shared/i18n";
import { resolveGpgSelection, type GpgSigningKey } from "@shared/identity/signing";

export function GpgKeyReference({ value, keys }: { value: string; keys: GpgSigningKey[] }) {
  const selection = resolveGpgSelection(value, keys);

  return (
    <div className="min-w-0 space-y-1 text-xs [overflow-wrap:anywhere]">
      {selection && (
        <>
          <p className="font-medium">
            {t(
              selection.signer
                ? selection.signer.fingerprint === selection.identity.fingerprint
                  ? "credentials.gpgKeyPicker.exactPrimary"
                  : "credentials.gpgKeyPicker.exactSubkey"
                : "credentials.gpgKeyPicker.automatic",
            )}
          </p>
          <p className="text-text-secondary">{selection.identity.userIds[0]}</p>
        </>
      )}
      <code className="select-text text-text-secondary">{value}</code>
    </div>
  );
}
