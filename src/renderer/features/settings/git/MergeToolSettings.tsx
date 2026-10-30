import { t } from "@shared/i18n";
import { useScopedSetting } from "../hooks/useScopedSetting";
import { useEffect, useId, useState } from "react";
import {
  defaultMergeTool,
  isMergeTool,
  type DetectedMergeTool,
  type MergeTool,
} from "@shared/integrations/merge-tool";
import {
  Button,
  Disclosure,
  ErrorDialog,
  Input,
  Select,
  Textarea,
} from "../../../components/ui/index";

export function MergeToolSettings({
  owner = "application",
}: {
  owner?: "application" | "profile";
}) {
  const setting = useScopedSetting("mergeTool", owner);
  const id = useId();
  const [config, setConfig] = useState(defaultMergeTool);
  const [draft, setDraft] = useState(defaultMergeTool);
  const [args, setArgs] = useState(defaultMergeTool().args.join("\n"));
  const [tools, setTools] = useState<DetectedMergeTool[]>([]);
  const [busy, setBusy] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    void window.eda.app
      .detectMergeTools()
      .then((result) => {
        if (!alive) return;
        if (result.ok) setTools(result.value);
        else setError(result.error.message);
      })
      .catch(() => {
        if (alive)
          setError(
            t("settings.mergeToolSettings.couldNotDetectMergeToolsYouCanStillChooseOneManually"),
          );
      })
      .finally(() => {
        if (alive) setBusy(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setConfig(setting.resolved.value);
    setDraft(setting.resolved.value);
    setArgs(setting.resolved.value.args.join("\n"));
  }, [setting.resolved]);

  const save = async (value: MergeTool) => {
    if (!isMergeTool(value)) {
      setError(
        t("settings.mergeToolSettings.invalidArguments", {
          baseToken: "{base}",
          currentToken: "{current}",
          incomingToken: "{incoming}",
          resultToken: "{result}",
        }),
      );
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const saved = await setting.set(value);

      if (!saved) {
        return;
      }

      setConfig(value);
      setDraft(value);
      setArgs(value.args.join("\n"));
      setMessage(t("settings.mergeToolSettings.mergeToolSaved"));
    } catch {
      setError(t("settings.mergeToolSettings.couldNotSaveTheMergeToolTryAgain"));
    } finally {
      setBusy(false);
    }
  };

  const choose = async (value: string) => {
    if (value === "global") {
      setBusy(true);
      setError(null);
      setMessage(null);

      try {
        await setting.reset();
      } finally {
        setBusy(false);
      }

      return;
    }

    if (value === "builtin") {
      await save(defaultMergeTool());
      return;
    }

    const tool = tools.find((item) => item.executable === value);

    if (tool) {
      await save({ executable: tool.executable, args: tool.args });
      return;
    }

    if (value !== "manual") return;

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const result = await window.eda.app.chooseMergeTool();

      if (!result.ok) setError(result.error.message);
      else if (result.value) {
        const detected = tools.find((item) => item.executable === result.value);

        if (detected) await save({ executable: detected.executable, args: detected.args });
        else {
          const next = {
            executable: result.value,
            args: config.executable === result.value ? config.args : defaultMergeTool().args,
          };

          setDraft(next);
          setArgs(next.args.join("\n"));
          setAdvanced(true);
          setMessage(
            t(
              "settings.mergeToolSettings.reviewTheToolSArgumentsInAdvancedOptionsThenSaveToEnableIt",
            ),
          );
        }
      }
    } catch {
      setError(t("settings.mergeToolSettings.couldNotChooseAMergeToolTryAgain"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 border-t border-border-subtle pt-5">
      <label htmlFor={id} className="text-sm font-medium">
        {t("settings.mergeToolSettings.mergeTool")}
      </label>
      <p className="text-xs text-text-secondary">
        {t("settings.mergeToolSettings.chooseWhereToResolveConflictingChangesBuiltInKeepsYouInEda")}
      </p>
      <Select
        id={id}
        disabled={busy || setting.reading}
        value={setting.following ? "global" : config.executable || "builtin"}
        onValueChange={(value) => void choose(value)}
        surface="base"
      >
        {owner === "profile" && <option value="global">{t("common.followGlobal")}</option>}
        <option value="builtin">{t("settings.mergeToolSettings.builtIn")}</option>
        {tools.map((tool) => (
          <option key={tool.executable} value={tool.executable}>
            {tool.name}
          </option>
        ))}
        {config.executable && !tools.some((tool) => tool.executable === config.executable) && (
          <option value={config.executable}>
            {t("settings.mergeToolSettings.customTool", {
              value1: config.executable.split(/[\\/]/).pop(),
            })}
          </option>
        )}
        <option value="manual">{t("settings.mergeToolSettings.chooseManually")}</option>
      </Select>
      <Disclosure
        title={t("settings.mergeToolSettings.advancedOptions")}
        open={advanced}
        onToggle={(event) => setAdvanced(event.currentTarget.open)}
      >
        <fieldset disabled={busy || setting.reading} aria-busy={busy} className="mt-3 space-y-3">
          <label className="block text-xs">
            {t("settings.mergeToolSettings.executablePath")}
            <Input
              aria-label={t("settings.mergeToolSettings.mergeToolExecutable")}
              value={draft.executable}
              onChange={(event) => setDraft({ ...draft, executable: event.target.value })}
            />
          </label>
          <label className="block text-xs">
            {t("settings.mergeToolSettings.argumentsOnePerLine")}
            <Textarea
              aria-label={t("settings.mergeToolSettings.mergeToolArguments")}
              value={args}
              onChange={(event) => setArgs(event.target.value)}
              className="mt-1 h-32 font-mono text-xs"
            />
          </label>
          <p className="text-xs text-text-secondary">
            {t("settings.mergeToolSettings.useAndForFilePathsEachLineIs", {
              value1: "{base}",
              value2: "{current}",
              value3: "{incoming}",
              value4: "{result}",
            })}
          </p>
          <Button
            size="sm"
            onClick={() => void save({ ...draft, args: args.split(/\r?\n/).filter(Boolean) })}
          >
            {t("settings.mergeToolSettings.saveMergeTool")}
          </Button>
        </fieldset>
      </Disclosure>
      <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
      {message && (
        <p role="status" className="text-xs text-text-secondary">
          {message}
        </p>
      )}
    </section>
  );
}
