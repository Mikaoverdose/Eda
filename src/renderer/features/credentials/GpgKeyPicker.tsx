import { t, getLocale } from "@shared/i18n";
import { Localized } from "@renderer/i18n/Localized";
import type { GpgSigningKey } from "@shared/identity/signing";
import {
  RefreshButton,
  Field,
  ErrorDialog,
  Input,
  Select,
  Disclosure,
} from "../../components/ui/index";

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
  const configured = value.replace(/^0x/i, "").replace(/!$/, "").toUpperCase();
  const matches = /^[\dA-F]{8,64}$/.test(configured)
    ? keys.filter((key) =>
        [key.fingerprint, ...key.signingFingerprints].some((fingerprint) =>
          fingerprint.endsWith(configured),
        ),
      )
    : [];

  const selectedGpg = matches.length === 1 ? matches[0] : undefined;

  return (
    <>
      <Field
        label={t("credentials.gpgKeyPicker.gpgSigningKey")}
        hint={t("credentials.gpgKeyPicker.chooseASigningKeyFromYourLocalGnuPgKeyring")}
      >
        {(props) => (
          <div className="flex items-center gap-2">
            <Select
              {...props}
              className="min-w-0 flex-1"
              disabled={loading && keys.length === 0}
              value={selectedGpg?.fingerprint ?? value}
              onValueChange={(value) => {
                onChange(value);
                onCommit?.(value);
              }}
            >
              <option value="" disabled>
                {t("credentials.gpgKeyPicker.chooseSigningKey")}
              </option>
              {value && !selectedGpg && (
                <option value={value}>
                  {t("credentials.gpgKeyPicker.configuredKey", { value: value })}
                </option>
              )}
              {keys.map((key) => (
                <option key={key.fingerprint} value={key.fingerprint}>
                  {key.userIds.find((uid) => uid.includes(email)) ||
                    key.userIds[0] ||
                    t("credentials.gpgKeyPicker.gpgKey")}{" "}
                  , {key.keyId}
                </option>
              ))}
            </Select>
            <RefreshButton
              label={t("credentials.gpgKeyPicker.refreshGpgKeys")}
              disabled={loading}
              onRefresh={onRefresh}
            />
          </div>
        )}
      </Field>
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
          {value && !selectedGpg && (
            <p className="text-xs text-git-modified">
              {t("credentials.gpgKeyPicker.theConfiguredKeyWasNotDetectedAsA")}
            </p>
          )}
        </>
      )}
      {selectedGpg && (
        <p className="break-all text-xs text-text-secondary">
          <Localized
            id="credentials.gpgKeyPicker.fingerprint"
            values={{
              code: <code>{selectedGpg.fingerprint}</code>,
              value2: selectedGpg.expiresAt
                ? t("credentials.gpgKeyPicker.expires", {
                    value1: new Date(selectedGpg.expiresAt * 1000).toLocaleDateString(getLocale()),
                  })
                : t("gpgKeyPicker.noExpiration"),
            }}
          />
        </p>
      )}

      <Disclosure title={t("credentials.gpgKeyPicker.useAKeyIdManually")} className="text-xs">
        <div className="mt-2">
          <Field
            label={t("credentials.gpgKeyPicker.gpgKeyId")}
            hint={t("credentials.gpgKeyPicker.forAKeyManagedOutsideTheDetectedKeyring")}
          >
            {(props) => (
              <Input
                {...props}
                mono
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onBlur={(event) => onCommit?.(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
              />
            )}
          </Field>
        </div>
      </Disclosure>
    </>
  );
}
