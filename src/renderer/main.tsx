import { initializeLocalization } from "./i18n/initialize";
import { t } from "@shared/i18n";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { SshHostTrustDialog } from "./features/credentials/SshHostTrustDialog";
import { IconDefaults } from "./components/ui/index";
import { RendererFailureBoundary } from "./app/RendererFailure";
import "./styles/base.css";

const container = document.getElementById("root");

if (!container) throw new Error(t("main.rootElementIsMissingFromIndexHtml"));

await initializeLocalization();

const tutorial =
  window !== window.parent && new URLSearchParams(window.location.search).get("eda-tour") === "1";
const Root = tutorial
  ? await import("./tutorial/DemoRoot").then(async (module) => {
      await module.initializeDemo();
      return module.DemoRoot;
    })
  : await import("./app/App").then((module) => module.App);

createRoot(container).render(
  <StrictMode>
    <RendererFailureBoundary>
      <IconDefaults>
        <Root />
        {!tutorial && <SshHostTrustDialog />}
      </IconDefaults>
    </RendererFailureBoundary>
  </StrictMode>,
);
