import { t } from "@shared/i18n";
import type { SshAgentMode, SshKey } from "@shared/identity/ssh";
import {
  DefinitionList,
  Disclosure,
  Field,
  Fingerprint,
  RefreshButton,
  Select,
} from "../../components/ui/index";

export function SshKeyList({
  keys,
  assignedPath,
  assigning,
  onAssign,
  onRefresh,
  agentSource,
}: {
  keys: SshKey[];
  assignedPath: string | undefined;
  assigning: boolean;
  onAssign: (path: string | null) => void;
  onRefresh?: () => Promise<boolean>;
  agentSource?: SshAgentMode | undefined;
}) {
  const selected = keys.find((key) => key.path === assignedPath);

  return (
    <div className="space-y-3">
      <Field label={t("credentials.sshKeyList.sshKey")}>
        {(props) => (
          <div className="flex items-center gap-2">
            <Select
              {...props}
              value={assignedPath || "none"}
              disabled={assigning}
              onValueChange={(value) => onAssign(value === "none" ? null : value)}
              surface="base"
              className="min-w-0 flex-1"
            >
              <option value="none">{t("credentials.sshKeyList.noAssignedKey")}</option>
              {keys.map((key) => (
                <option key={key.path} value={key.path}>
                  {key.comment || key.path.split(/[\\/]/).pop()}, {key.type} ,{" "}
                  {key.path.split(/[\\/]/).pop()}
                </option>
              ))}
              {assignedPath && !selected && (
                <option value={assignedPath}>
                  {t("credentials.sshKeyList.externalKey", { assignedPath: assignedPath })}
                </option>
              )}
            </Select>
            {onRefresh && (
              <RefreshButton
                label={t("credentials.sshKeyList.refreshSshKeys")}
                disabled={assigning}
                onRefresh={onRefresh}
              />
            )}
          </div>
        )}
      </Field>
      {keys.length === 0 && !assignedPath && (
        <p className="text-xs text-text-secondary">
          {t("credentials.sshKeyList.noSshKeysFoundImportAnExistingKeyOrGenerateOneAbove")}
        </p>
      )}
      {assignedPath && (
        <>
          {selected && (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="text-xs text-text-secondary">
                {!selected.encrypted
                  ? t("credentials.sshKeyList.keyAvailableNoPassphraseNeeded")
                  : selected.loadedInAgent
                    ? t("credentials.sshKeyList.keyUnlockedInTheSshAgent")
                    : t("credentials.sshKeyList.passphraseRequiredUnlockThisKeyBelowToConnect")}
              </p>
              <Fingerprint value={selected.fingerprint} />
            </div>
          )}
          <Disclosure key={assignedPath} title={t("credentials.sshKeyList.selectedKeyDetails")}>
            <div className="mt-3">
              <DefinitionList
                items={[
                  {
                    label: t("credentials.sshKeyList.privateKey"),
                    value: <span className="font-mono text-xs">{assignedPath}</span>,
                  },
                  ...(agentSource
                    ? [
                        {
                          label: t("credentials.sshKeyList.sshAgent"),
                          value:
                            agentSource === "builtin"
                              ? t("sshKeyList.builtInManagedByEda")
                              : t("sshKeyList.systemAgent"),
                        },
                      ]
                    : []),
                  ...(selected
                    ? [
                        {
                          label: t("credentials.sshKeyList.protection"),
                          value: selected.encrypted
                            ? t("sshKeyList.passphraseProtected")
                            : t("sshKeyList.noPassphrase"),
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          </Disclosure>
        </>
      )}
    </div>
  );
}
