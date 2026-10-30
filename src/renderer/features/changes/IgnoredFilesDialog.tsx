import { t } from "@shared/i18n";
import { useEffect, useState } from "react";
import { Dialog, Input, ErrorDialog, TextButton } from "../../components/ui/index";
import { IgnoreDialog } from "./IgnoreDialog";
import { VirtualRows } from "../../components/ui/display/VirtualRows";

export function IgnoredFilesDialog({
  repositoryId,
  onClose,
}: {
  repositoryId: string;
  onClose: () => void;
}) {
  const [paths, setPaths] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    let alive = true;

    void window.eda.repository.ignoredFiles(repositoryId).then((result) => {
      if (!alive) return;
      setLoading(false);
      if (result.ok) {
        setPaths(result.value.paths);
        setTruncated(result.value.truncated);
      } else setError(result.error.message);
    });

    return () => {
      alive = false;
    };
  }, [repositoryId]);

  const matches = paths.filter((path) =>
    path.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );

  if (selected)
    return (
      <IgnoreDialog repositoryId={repositoryId} path={selected} onClose={() => setSelected(null)} />
    );

  return (
    <Dialog
      title={t("ignoredFilesDialog.ignoredFiles")}
      description={t("ignoredFilesDialog.gitResolvesRepositoryNestedAndGlobalExcludeRules")}
      onClose={onClose}
    >
      <Input
        aria-label={t("ignoredFilesDialog.findIgnoredFiles")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("ignoredFilesDialog.filterIgnoredPaths")}
      />
      <div className="mt-3 h-64">
        <VirtualRows
          items={matches}
          rowHeight={28}
          className="h-full"
          renderRow={(path) => (
            <TextButton
              key={path}
              title={path}
              className="block h-7 w-full truncate px-1 text-left font-mono text-xs hover:bg-bg-raised"
              onClick={() => setSelected(path)}
            >
              {path}
            </TextButton>
          )}
        />
      </div>
      <p role="status" className="mt-2 text-xs text-text-tertiary">
        {loading
          ? t("ignoredFilesDialog.readingIgnoredPaths")
          : t("ignoredFilesDialog.matchingFiles", {
              length: matches.length,
              value2: truncated ? t("ignoredFilesDialog.first5000Retained") : "",
            })}
      </p>
      <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>
    </Dialog>
  );
}
