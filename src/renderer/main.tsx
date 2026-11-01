import { ERROR_CODE } from "@shared/error-codes";
import { AppError } from "@shared/errors";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initializeLocalization } from "./i18n/initialize";

import { RendererFailureBoundary } from "./app/RendererFailure";
import { IconDefaults } from "./components/ui/index";
import { SshHostTrustDialog } from "./features/credentials/SshHostTrustDialog";
import "./styles/base.css";

const container = document.getElementById("root");

if (!container) throw new AppError(ERROR_CODE.ROOT_ELEMENT_MISSING);

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
