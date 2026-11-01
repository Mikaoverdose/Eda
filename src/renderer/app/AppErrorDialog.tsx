import { errorAction, errorMessage } from "@shared/errors";
import { ErrorDialog } from "../components/ui/index";
import { useAppStore } from "../stores/app-store";

export function AppErrorDialog() {
  const error = useAppStore((state) => state.error);
  const dismiss = useAppStore((state) => state.dismissError);

  if (!error) return null;

  return (
    <ErrorDialog key={errorMessage(error)} onDismiss={dismiss}>
      <p>{errorMessage(error)}</p>
      {errorAction(error) && <p className="mt-2">{errorAction(error)}</p>}
      {error.repositoryPath && (
        <p className="mt-2 break-all font-mono text-xs">{error.repositoryPath}</p>
      )}
    </ErrorDialog>
  );
}
