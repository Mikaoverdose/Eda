import { t } from "@shared/i18n";
import { isOneOf } from "@shared/validation";
import { FILE_VIEW_MODES, FILE_VIEW_STATUSES, type FileView } from "@shared/preferences/file-view";
import { SearchField, Select } from "../../components/ui/index";

export function ChangeFilters({
  files,
  onChange,
}: {
  files: FileView;
  onChange: (change: Partial<FileView>) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-1.5 text-xs text-text-secondary">
      <SearchField
        aria-label={t("changesPanel.filterChangedFiles")}
        placeholder={t("changesPanel.filterFiles")}
        value={files.query}
        maxLength={512}
        className="min-w-0 flex-1"
        onChange={(event) => onChange({ query: event.target.value })}
      />

      <Select
        aria-label={t("changesPanel.filterFileStatus")}
        value={files.status}
        compact
        surface="surface"
        className="max-w-32"
        onValueChange={(value) => {
          if (isOneOf(value, FILE_VIEW_STATUSES)) onChange({ status: value });
        }}
      >
        <option value="">{t("changesPanel.allStatuses")}</option>

        {Object.entries({
          M: t("changesPanel.modified"),
          A: t("changesPanel.added"),
          D: t("changesPanel.deleted"),
          R: t("changesPanel.renamed"),
          C: t("changesPanel.copied"),
          T: t("changesPanel.typeChanged"),
          U: t("changesPanel.conflicted"),
          "?": t("changesPanel.untracked"),
        }).map(([code, label]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </Select>

      <Select
        aria-label={t("changesPanel.fileListView")}
        value={files.mode}
        compact
        surface="surface"
        onValueChange={(value) => {
          if (isOneOf(value, FILE_VIEW_MODES)) onChange({ mode: value });
        }}
      >
        <option value="flat">{t("changesPanel.flat")}</option>
        <option value="path">{t("changesPanel.paths")}</option>
        <option value="tree">{t("changesPanel.tree")}</option>
      </Select>
    </div>
  );
}
