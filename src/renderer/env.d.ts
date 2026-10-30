import type { EdaApi } from "@shared/ipc";
import type { BuildInfo } from "@shared/version";

declare global {
  const __EDA_BUILD_INFO__: BuildInfo;

  interface Window {
    readonly eda: EdaApi;
  }
}

export {};
