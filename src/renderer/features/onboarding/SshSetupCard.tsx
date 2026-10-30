import { t } from "@shared/i18n";
import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import type { Identity } from "@shared/identity/identity";
import type { SshKey } from "@shared/identity/ssh";
import { useAppStore } from "../../stores/app-store";
import {
  ActionIndicator,
  Button,
  CopyButton,
  Field,
  NoticeBanner,
  Select,
} from "../../components/ui/index";
import { ConnectionCard } from "../connections/ConnectionCard";

export function SshSetupCard({ identity }: { identity: Identity }) {
  const refreshIdentities = useAppStore((state) => state.refreshIdentities);
  const [keys, setKeys] = useState<SshKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void window.eda.ssh
      .listKeys()
      .then((result) => {
        if (!active) return;
        if (result.ok) setKeys(result.value);
        else setError(result.error.message);
      })
      .catch(() => {
        if (active) setError(t("onboarding.sshSetupCard.couldNotLoadSshKeysTryAgain"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const assign = async (path: string | null) => {
    const result = await window.eda.identity.assignSshKey(path, identity.id);
    if (!result.ok) throw new Error(result.error.message);
    await refreshIdentities();
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : t("onboarding.sshSetupCard.couldNotSetUpTheSshKeyTryAgain"),
      );
    } finally {
      setBusy(false);
    }
  };

  const addKey = (generate: boolean) =>
    run(async () => {
      const chosen = await (generate
        ? window.eda.ssh.chooseKeyDestination()
        : window.eda.ssh.choosePrivateKey());
      if (!chosen.ok) throw new Error(chosen.error.message);
      if (!chosen.value) return;
      const result = await (generate
        ? window.eda.ssh.generateKey({
            path: chosen.value,
            type: "ed25519",
            comment: identity.gitEmail,
          })
        : window.eda.ssh.importKey(chosen.value));
      if (!result.ok) throw new Error(result.error.message);
      const key = result.value;
      setKeys((current) => [...current.filter((item) => item.path !== key.path), key]);
      await assign(key.path);
    });

  const selected = keys.find((key) => key.path === identity.sshKeyPath);
  return (
    <ConnectionCard
      title={t("onboarding.sshSetupCard.ssh")}
      icon={<KeyRound size={16} aria-hidden="true" />}
      completedLabel={identity.sshKeyPath ? t("onboarding.sshSetupCard.sshKeyAssigned") : undefined}
      status={
        loading || busy ? (
          <span
            role="status"
            aria-label={
              loading
                ? t("onboarding.sshSetupCard.loadingSshKeys")
                : t("onboarding.sshSetupCard.savingSshKey")
            }
            className="text-text-tertiary"
          >
            <ActionIndicator state="pending" />
          </span>
        ) : null
      }
    >
      {error && <NoticeBanner tone="error">{error}</NoticeBanner>}
      <fieldset
        disabled={busy || loading}
        aria-busy={busy || loading}
        className="min-w-0 space-y-3"
      >
        <legend className="sr-only">{t("onboarding.sshSetupCard.sshKeySetup")}</legend>
        {(keys.length > 0 || identity.sshKeyPath) && (
          <Field label={t("onboarding.sshSetupCard.sshKey")}>
            {(props) => (
              <Select
                {...props}
                value={identity.sshKeyPath || "none"}
                onValueChange={(value) => void run(() => assign(value === "none" ? null : value))}
              >
                <option value="none">{t("onboarding.sshSetupCard.noAssignedKey")}</option>
                {keys.map((key) => (
                  <option key={key.path} value={key.path}>
                    {key.path.split(/[\\/]/).pop()} — {key.comment || key.type}
                  </option>
                ))}
                {identity.sshKeyPath && !selected && (
                  <option value={identity.sshKeyPath}>
                    {identity.sshKeyPath.split(/[\\/]/).pop()}
                  </option>
                )}
              </Select>
            )}
          </Field>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void addKey(false)}>
            {t("onboarding.sshSetupCard.importKey")}
          </Button>
          <Button size="sm" onClick={() => void addKey(true)}>
            {t("onboarding.sshSetupCard.generateKey")}
          </Button>
        </div>
      </fieldset>
      {identity.sshKeyPath && (
        <div className="space-y-2 text-xs leading-relaxed text-text-secondary">
          <p>{t("onboarding.sshSetupCard.keyAssignedAddItsPublicKeyToYourGitHostToAllowAccess")}</p>
          {selected?.publicKey && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-bg-base px-3 py-2">
              <span>{t("onboarding.sshSetupCard.publicKey")}</span>
              <CopyButton
                value={selected.publicKey}
                label={t("onboarding.sshSetupCard.copyPublicKey")}
              />
            </div>
          )}
          {selected?.encrypted && (
            <p>{t("onboarding.sshSetupCard.passphraseProtectedYouCanUnlockThisKeyInSettings")}</p>
          )}
        </div>
      )}
    </ConnectionCard>
  );
}
