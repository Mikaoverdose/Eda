import { t } from "@shared/i18n";
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button, type ButtonProps } from "./Button";
import { ActionIndicator, type ActionState } from "./ActionIndicator";
import { ACTION_FEEDBACK } from "../../../motion";

export function AsyncButton({
  label,
  onAction,
  icon = <RefreshCw size={16} aria-hidden="true" />,
  completed = false,
  children,
  ...props
}: Omit<ButtonProps, "onClick" | "busy" | "busyIndicator"> & {
  label: string;
  onAction: () => Promise<boolean>;
  completed?: boolean;
}) {
  const [state, setState] = useState<ActionState>("idle");
  const running = useRef(false);
  const mounted = useRef(true);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(resetTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!completed || running.current) return;
    clearTimeout(resetTimer.current);
    setState("success");
    resetTimer.current = setTimeout(() => setState("idle"), ACTION_FEEDBACK.outcomeHold);
  }, [completed]);

  const refresh = async () => {
    if (running.current) return;

    running.current = true;
    clearTimeout(resetTimer.current);
    setState("pending");

    const [success] = await Promise.all([
      Promise.resolve()
        .then(onAction)
        .catch(() => false),
      new Promise<void>((resolve) => setTimeout(resolve, ACTION_FEEDBACK.minimumPending)),
    ]);

    running.current = false;

    if (!mounted.current) return;

    setState(success ? "success" : "error");
    resetTimer.current = setTimeout(() => setState("idle"), ACTION_FEEDBACK.outcomeHold);
  };

  return (
    <>
      <Button
        {...props}
        aria-label={label}
        busy={state === "pending"}
        busyIndicator={false}
        onClick={() => void refresh()}
        icon={<ActionIndicator state={state} idleIcon={icon} />}
      >
        {children}
      </Button>
      <span role="status" className="sr-only">
        {state === "success"
          ? t("asyncButton.completed", { label: label })
          : state === "error"
            ? t("asyncButton.failedTryAgain", { label: label })
            : ""}
      </span>
    </>
  );
}
