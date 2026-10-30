import { t } from "@shared/i18n";
import { autosquashPlan, type RebasePlanEntry } from "@shared/workflows/rebase";
import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button, IconButton, Select, Textarea } from "../../components/ui/index";

export function RebasePlanEditor({
  plan,
  disabled,
  onChange,
  original,
}: {
  plan: RebasePlanEntry[];
  disabled: boolean;
  onChange: (plan: RebasePlanEntry[]) => void;
  original: RebasePlanEntry[];
}) {
  const [warnings, setWarnings] = useState<string[]>([]);
  const change = (index: number, patch: Partial<RebasePlanEntry>) =>
    onChange(plan.map((entry, position) => (position === index ? { ...entry, ...patch } : entry)));
  const move = (index: number, direction: number) => {
    const next = [...plan];
    [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
    onChange(next);
  };

  return (
    <section aria-label={t("rebasePlanEditor.rebaseCommitPlan")} className="space-y-3">
      <p className="text-text-secondary">
        {t("rebasePlanEditor.commitsReplayFromTopToBottomSquashCombines")}
      </p>
      <Button
        size="sm"
        disabled={disabled}
        onClick={() => {
          const result = autosquashPlan(original);
          setWarnings(result.warnings);
          onChange(result.plan);
        }}
      >
        {t("rebasePlanEditor.resetAndAutosquash")}
      </Button>
      <p className="text-text-secondary">
        {t("rebasePlanEditor.autosquashRebuildsThePlanFromOriginalFixupSquash")}
      </p>
      {warnings.length > 0 && (
        <ul role="status" className="text-git-modified">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      <ol className="max-h-80 space-y-2 overflow-auto">
        {plan.map((entry, index) => (
          <li key={entry.oid} className="rounded border border-border-default p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-text-tertiary">{index + 1}.</span>
              <Select
                aria-label={t("rebasePlanEditor.actionFor", { oid: entry.oid.slice(0, 8) })}
                value={entry.action}
                disabled={disabled}
                surface="surface"
                compact
                onValueChange={(value) => {
                  const action = value as RebasePlanEntry["action"];
                  const previous = plan.slice(0, index).findLast((item) => item.action !== "drop");

                  change(index, {
                    action,
                    ...(action === "squash" && entry.action !== "squash" && previous
                      ? { message: `${previous.message}\n\n${entry.message}` }
                      : {}),
                  });
                }}
              >
                <option value="pick">{t("rebasePlanEditor.pick")}</option>
                <option value="reword">{t("rebasePlanEditor.reword")}</option>
                <option value="squash">{t("rebasePlanEditor.squash")}</option>
                <option value="drop">{t("rebasePlanEditor.drop")}</option>
                <option value="fixup">{t("rebasePlanEditor.fixup")}</option>
                <option value="fixup-reword">{t("rebasePlanEditor.fixupMessage")}</option>
                <option value="edit">{t("common.edit")}</option>
              </Select>
              <code className="text-text-secondary">{entry.oid.slice(0, 8)}</code>
              <span className="order-last w-full break-words sm:order-none sm:w-auto sm:min-w-0 sm:flex-1 sm:truncate">
                {entry.message.split("\n")[0]}
              </span>
              <IconButton
                size="xs"
                className="ml-auto sm:ml-0"
                disabled={disabled || index === 0}
                aria-label={t("rebasePlanEditor.moveUp", { oid: entry.oid.slice(0, 8) })}
                onClick={() => move(index, -1)}
                icon={<ArrowUp size={14} aria-hidden="true" />}
              />
              <IconButton
                size="xs"
                disabled={disabled || index === plan.length - 1}
                aria-label={t("rebasePlanEditor.moveDown", { oid: entry.oid.slice(0, 8) })}
                onClick={() => move(index, 1)}
                icon={<ArrowDown size={14} aria-hidden="true" />}
              />
            </div>
            {["reword", "squash", "fixup-reword"].includes(entry.action) && (
              <Textarea
                aria-label={t("rebasePlanEditor.messageFor", { oid: entry.oid.slice(0, 8) })}
                value={entry.message}
                disabled={disabled}
                rows={3}
                surface="surface"
                className="font-mono"
                onChange={(event) => change(index, { message: event.target.value })}
              />
            )}
          </li>
        ))}
      </ol>
      <p role="status">
        {t("rebasePlanEditor.resultCommitsDroppedConflictsMayRequireResolution", {
          length: plan.filter((entry) => ["pick", "reword", "edit"].includes(entry.action)).length,
          lengthValue: plan.filter((entry) => entry.action === "drop").length,
        })}
      </p>
    </section>
  );
}
