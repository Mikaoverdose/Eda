import { t } from "@shared/i18n";
import { RotateCcw } from "lucide-react";
import { defaultCommitPrefixes, parseCommitPrefixes } from "@shared/preferences/commit-prefix";
import { useEffect, useId, useState } from "react";
import {
  SETTING_DEFINITIONS,
  type ResolvedSetting,
  type SettingScope,
} from "@shared/preferences/settings";
import { preferenceSource, usePreferencesStore } from "../../../stores/preferences-store";
import { Button, Checkbox, Textarea, IconButton, Dialog } from "../../../components/ui/index";

export function CommitPrefixSettings({ scope }: { scope: SettingScope }) {
  const inputId = useId();
  const values = usePreferencesStore((state) => state.values);
  const [enabled, setEnabled] = useState<ResolvedSetting<"conventionalCommitsEnabled"> | null>(
    null,
  );
  const [prefixes, setPrefixes] = useState<ResolvedSetting<"commitPrefixes"> | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    let alive = true;
    const context = scope.kind === "profile" ? { profileId: scope.profileId } : {};

    void Promise.all([
      window.eda.settings.resolve("conventionalCommitsEnabled", context),
      window.eda.settings.resolve("commitPrefixes", context),
    ]).then(([toggle, list]) => {
      if (!alive) return;
      if (toggle.ok) setEnabled(toggle.value);
      if (list.ok) {
        setPrefixes(list.value);
        setText(list.value.value.join("\n"));
      }
    });

    return () => {
      alive = false;
    };
  }, [scope.kind, scope.kind === "profile" ? scope.profileId : undefined, values]);

  if (!enabled || !prefixes) return null;

  const parsed = parseCommitPrefixes(text);
  const valid = SETTING_DEFINITIONS.commitPrefixes.validate(parsed);
  const changed = JSON.stringify(parsed) !== JSON.stringify(prefixes.value);

  return (
    <div className="space-y-3 border-b border-border-subtle pb-4">
      <h2 className="text-sm font-medium">
        {t("settings.commitPrefixSettings.conventionalCommits")}
      </h2>
      <Checkbox
        checked={enabled.value}
        onChange={(event) =>
          void usePreferencesStore
            .getState()
            .set("conventionalCommitsEnabled", scope, event.target.checked)
        }
      >
        {t("settings.commitPrefixSettings.showCommitPrefixPicker")}
      </Checkbox>
      <p className="text-xs text-text-secondary">
        {t("settings.commitPrefixSettings.selectingAPrefixAddsItToTheSaved", {
          value1: preferenceSource(enabled),
        })}
      </p>
      {scope.kind === "profile" && enabled.source.kind === "profile" && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            void usePreferencesStore.getState().reset("conventionalCommitsEnabled", scope)
          }
        >
          {t("common.followGlobal")}
        </Button>
      )}
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="text-sm">
          {t("settings.commitPrefixSettings.commitPrefixes")}
        </label>
        <IconButton
          icon={<RotateCcw size={14} />}
          aria-label={t("settings.commitPrefixSettings.resetCommitPrefixes")}
          title={t("settings.commitPrefixSettings.resetCommitPrefixes")}
          onClick={() => setResetOpen(true)}
        />
      </div>
      <div>
        <Textarea
          id={inputId}
          aria-label={t("settings.commitPrefixSettings.commitPrefixes")}
          rows={4}
          value={text}
          onChange={(event) => setText(event.target.value)}
          invalid={!valid}
        />
      </div>
      <p className="text-xs text-text-secondary">
        {t("settings.commitPrefixSettings.enterOneTypePerLineOrSeparateWith", {
          value1: preferenceSource(prefixes),
        })}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!valid || !changed}
          onClick={() => void usePreferencesStore.getState().set("commitPrefixes", scope, parsed)}
        >
          {t("settings.commitPrefixSettings.savePrefixes")}
        </Button>
        {scope.kind === "profile" && prefixes.source.kind === "profile" && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void usePreferencesStore.getState().reset("commitPrefixes", scope)}
          >
            {t("settings.commitPrefixSettings.followGlobalPrefixes")}
          </Button>
        )}
      </div>
      {resetOpen && (
        <Dialog
          title={t("settings.commitPrefixSettings.resetCommitPrefixes")}
          description={t(
            "settings.commitPrefixSettings.restoreTheDefaultPrefixesWithOrWithoutEmojis",
          )}
          onClose={() => {
            if (!resetting) setResetOpen(false);
          }}
        >
          <div className="flex flex-wrap gap-2">
            {[false, true].map((emojis) => (
              <Button
                key={String(emojis)}
                disabled={resetting}
                onClick={async () => {
                  setResetting(true);

                  try {
                    if (
                      await usePreferencesStore
                        .getState()
                        .set("commitPrefixes", scope, defaultCommitPrefixes(emojis))
                    )
                      setResetOpen(false);
                  } finally {
                    setResetting(false);
                  }
                }}
              >
                {emojis
                  ? t("settings.commitPrefixSettings.withEmojis")
                  : t("settings.commitPrefixSettings.withoutEmojis")}
              </Button>
            ))}
            <Button variant="ghost" disabled={resetting} onClick={() => setResetOpen(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
