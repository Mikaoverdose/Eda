import { t } from "@shared/i18n";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { redactDiagnostic } from "@shared/diagnostics";
import { Button } from "../components/ui/actions/Button";

interface Props {
  children: ReactNode;
}

interface State {
  error: string | null;
}

export function FailureScreen({ detail }: { detail: string }) {
  return (
    <main className="flex h-full items-center justify-center bg-bg-base p-6">
      <div
        role="alert"
        className="w-full max-w-lg space-y-3 rounded-lg border border-border-default bg-bg-surface p-6"
      >
        <h1 className="text-xl font-semibold">
          {t("rendererFailure.edaCouldNotDisplayThisScreen")}
        </h1>
        <p className="break-words text-sm text-text-secondary">{detail}</p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          {t("rendererFailure.reloadEda")}
        </Button>
      </div>
    </main>
  );
}

export class RendererFailureBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return {
      error: redactDiagnostic(
        error.message || t("rendererFailure.anUnexpectedRendererErrorOccurred"),
      ),
    };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error("Eda renderer failed:", redactDiagnostic(error.message));
  }

  override render() {
    return this.state.error ? <FailureScreen detail={this.state.error} /> : this.props.children;
  }
}
