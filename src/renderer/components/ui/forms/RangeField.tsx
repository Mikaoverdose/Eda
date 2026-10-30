import { useEffect, useId, useRef, useState } from "react";
import { Slider } from "./Slider";

export function RangeField({
  label,
  value,
  min = 0,
  max = 100,
  unit = "%",
  disabled,
  onCommit,
  onPreview,
  onCancel,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  unit?: string;
  disabled?: boolean;
  onCancel?: () => void;
  onPreview?: (value: number) => void;
  onCommit: (value: number) => Promise<boolean> | void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const last = useRef(value);
  const current = useRef(value);
  const previewing = useRef(false);
  const revision = useRef(0);

  useEffect(() => {
    revision.current += 1;
    setDraft(value);
    current.current = value;
    last.current = value;

    return () => {
      revision.current += 1;
    };
  }, [value]);

  const commit = () => {
    const next = current.current;

    if (last.current === next) {
      if (previewing.current) onCancel?.();
      previewing.current = false;
      return;
    }

    previewing.current = false;
    last.current = next;
    const submittedRevision = ++revision.current;
    const restore = () => {
      if (revision.current === submittedRevision) {
        setDraft(value);
        current.current = value;
        last.current = value;
      }
    };

    void (async () => {
      try {
        if ((await onCommit(next)) === false) restore();
      } catch {
        restore();
      }
    })();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="text-xs tabular-nums text-text-secondary">
          {draft}
          {unit}
        </output>
      </div>
      <Slider
        id={id}
        className="w-full"
        value={draft}
        min={min}
        max={max}
        disabled={disabled}
        aria-valuetext={`${draft}${unit}`}
        onChange={(event) => {
          const next = Number(event.target.value);
          revision.current += 1;
          current.current = next;
          setDraft(next);
          previewing.current = true;
          onPreview?.(next);
        }}
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerCancel={() => {
          revision.current += 1;
          current.current = value;
          setDraft(value);
          previewing.current = false;
          onCancel?.();
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </div>
  );
}
