import { t } from "@shared/i18n";
import { watch, type FSWatcher } from "node:fs";
import { isIgnoredWatchPath } from "./watch-filter";

const DEFAULT_DEBOUNCE_MS = 150;

interface Entry {
  watcher?: FSWatcher;
  timer?: NodeJS.Timeout;
  poll?: NodeJS.Timeout;
}

export class RepositoryWatcher {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly onChange: (repositoryId: string, warning?: string) => void,
    private readonly debounceMs: number = DEFAULT_DEBOUNCE_MS,
  ) {}

  watch(repositoryId: string, repositoryPath: string): void {
    this.unwatch(repositoryId);

    let watcher: FSWatcher;

    try {
      watcher = watch(repositoryPath, { recursive: true, persistent: false });
    } catch {
      this.poll(repositoryId);
      return;
    }

    const entry: Entry = { watcher };

    this.entries.set(repositoryId, entry);
    watcher.on("error", () => {
      if (this.entries.get(repositoryId) !== entry) return;
      this.unwatch(repositoryId);
      this.poll(repositoryId);
    });
    watcher.on("change", (_event, name) => {
      if (this.entries.get(repositoryId) !== entry) return;
      if (name != null && isIgnoredWatchPath(name.toString())) return;
      this.schedule(repositoryId);
    });
  }

  unwatch(repositoryId: string): void {
    const entry = this.entries.get(repositoryId);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.poll) clearInterval(entry.poll);
    entry.watcher?.close();
    this.entries.delete(repositoryId);
  }

  closeAll(): void {
    for (const id of [...this.entries.keys()]) this.unwatch(id);
  }

  private poll(repositoryId: string): void {
    const poll = setInterval(() => this.onChange(repositoryId), 5000);

    poll.unref();
    this.entries.set(repositoryId, { poll });
    this.onChange(
      repositoryId,
      t("main.repositoryWatcher.fileWatchingIsUnavailableEdaRefreshesEveryFive"),
    );
  }

  private schedule(repositoryId: string): void {
    const entry = this.entries.get(repositoryId);

    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);

    entry.timer = setTimeout(() => {
      const current = this.entries.get(repositoryId);
      if (current !== entry) return;
      delete current.timer;
      this.onChange(repositoryId);
    }, this.debounceMs);
  }
}
