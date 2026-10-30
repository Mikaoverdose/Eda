import { useId, type ComponentPropsWithRef, type ReactNode } from "react";
import { cx } from "../cx";
import { controlAppearance, controlSize } from "./controlStyles";

export interface InputProps extends Omit<ComponentPropsWithRef<"input">, "size" | "className"> {
  mono?: boolean;
  size?: "sm" | "md";
  invalid?: boolean;
}

export function Input({ mono = false, size = "md", invalid = false, ...rest }: InputProps) {
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={cx(
        controlAppearance("inset", invalid),
        controlSize(size),
        "w-full select-text placeholder:text-text-tertiary",
        mono && "font-mono tracking-normal",
      )}
    />
  );
}

export interface FieldProps {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: (props: { id: string; "aria-describedby": string | undefined }) => ReactNode;
}

export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const descriptionId = `${id}-description`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>

      {children({ id, "aria-describedby": error || hint ? descriptionId : undefined })}

      {(error ?? hint) && (
        <span
          id={descriptionId}
          role={error ? "alert" : undefined}
          className={cx("text-xs", error ? "text-git-deleted" : "text-text-tertiary")}
        >
          {error ?? hint}
        </span>
      )}
    </div>
  );
}
