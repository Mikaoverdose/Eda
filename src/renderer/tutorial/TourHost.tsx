import { t } from "@shared/i18n";
import { useEffect, useRef, useState } from "react";
import { usePreferencesStore } from "../stores/preferences-store";

export function TourHost({ onClose }: { onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const opener = document.activeElement;
    let ready = false;
    let disposed = false;
    const sendAppearance = () => {
      if (!ready || disposed) return;
      frame.current?.contentWindow?.postMessage(
        {
          type: "eda:tour-appearance",
          style: document.documentElement.style.cssText,
          attributes: { ...document.documentElement.dataset },
          preferences: usePreferencesStore.getState().values,
          platform: window.eda.app.platform,
        },
        "*",
      );
    };
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "eda:tour-ready") {
        ready = true;
        sendAppearance();
      }
      if (event.data?.type === "eda:tour-presented") {
        setVisible(true);
        frame.current?.focus();
      }
      if (event.data?.type === "eda:tour-finished") onClose();
    };
    const appearance = new MutationObserver(sendAppearance);
    appearance.observe(document.documentElement, { attributes: true });
    const unsubscribe = usePreferencesStore.subscribe(sendAppearance);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("message", receive);
    window.addEventListener("keydown", escape, true);
    return () => {
      disposed = true;
      appearance.disconnect();
      unsubscribe();
      window.removeEventListener("message", receive);
      window.removeEventListener("keydown", escape, true);
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [onClose]);
  const url = new URL("index.html", window.location.href);
  url.searchParams.set("eda-tour", "1");
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label={t("tutorial.tourHost.welcomeTour")}
      data-visible={visible}
      aria-hidden={!visible}
      inert={!visible}
      className="ui-tour-reveal fixed inset-0 z-[200] flex flex-col bg-bg-base"
    >
      <iframe
        ref={frame}
        title={t("tutorial.tourHost.interactiveEdaTutorial")}
        src={url.href}
        sandbox="allow-scripts allow-same-origin"
        className="min-h-0 w-full flex-1 border-0"
      />
    </section>
  );
}
