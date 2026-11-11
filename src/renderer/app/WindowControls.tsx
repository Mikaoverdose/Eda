import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import type { EdaApi } from "@shared/ipc";
import {
  CopyIcon as Copy,
  BranchIcon as GitBranch,
  MinusIcon as Minus,
  SquareIcon as Square,
  CloseIcon as X,
} from "../components/ui/icons";
import { useEffect, useState, type ReactNode } from "react";
import { ErrorDialog, WindowControlButton } from "../components/ui/index";

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (action: Parameters<EdaApi["app"]["windowControl"]>[0]) => {
    try {
      const result = await window.eda.app.windowControl(action);

      if (result.ok) {
        setMaximized(result.value.maximized);
        setError(null);
      } else setError(errorMessage(result.error));
    } catch {
      setError(t("windowControls.windowControlsAreUnavailableUseTheSystemWindowMenuToCloseEda"));
    }
  };

  useEffect(() => {
    const sync = () => void act("state");
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  return (
    <div
      className="window-controls relative z-[80] ml-2 flex h-full shrink-0 items-stretch"
      aria-label={t("windowControls.windowControls")}
    >
      <WindowControlButton
        aria-label={t("windowControls.minimizeWindow")}
        title={t("windowControls.minimize")}
        onClick={() => void act("minimize")}
      >
        <Minus size={14} />
      </WindowControlButton>

      <WindowControlButton
        aria-label={
          maximized ? t("windowControls.restoreWindow") : t("windowControls.maximizeWindow")
        }
        title={maximized ? t("windowControls.restore") : t("windowControls.maximize")}
        onClick={() => void act("toggle-maximize")}
      >
        {maximized ? <Copy size={12} /> : <Square size={12} />}
      </WindowControlButton>

      <WindowControlButton
        close
        aria-label={t("windowControls.closeWindow")}
        title={t("common.close")}
        onClick={() => void act("close")}
      >
        <X size={16} />
      </WindowControlButton>

      {error && <ErrorDialog onDismiss={() => setError(null)}>{error}</ErrorDialog>}
    </div>
  );
}

export function WindowTitlebar({ children }: { children?: ReactNode }) {
  const platform = window.eda.app.platform;

  return (
    <header
      data-tour="titlebar"
      data-platform={platform}
      className="window-titlebar app-surface-chrome flex h-toolbar shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-inset pl-3"
    >
      <span className="flex shrink-0 items-center gap-2 pr-3 text-sm font-semibold text-text-secondary">
        <GitBranch size={15} aria-hidden="true" />
        {t("windowControls.eda")}
      </span>

      {children ?? <div className="min-w-0 flex-1" />}
      {platform !== "mac" && <WindowControls />}
    </header>
  );
}
