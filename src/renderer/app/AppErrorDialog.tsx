import { useAppStore } from "../stores/app-store";
import { ErrorDialog } from "../components/ui/index";

export function AppErrorDialog() {
  const error = useAppStore((state) => state.error);
  const dismiss = useAppStore((state) => state.dismissError);

  if (!error) return null;

  return (
    <ErrorDialog key={error.message} onDismiss={dismiss}>
      <p>{error.message}</p>
      {error.suggestedAction && <p className="mt-2">{error.suggestedAction}</p>}
      {error.repositoryPath && (
        <p className="mt-2 break-all font-mono text-xs">{error.repositoryPath}</p>
      )}
    </ErrorDialog>
  );
}
