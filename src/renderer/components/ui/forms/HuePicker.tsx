import { t } from "@shared/i18n";
import { useEffect, useId, useRef, useState } from "react";
import { PaletteIcon as Palette } from "../icons";
import {
  ACCENT_SWATCH_LIGHTNESS,
  DEFAULT_ACCENT_CHROMA,
  accentToHex,
  isHexColor,
  type AccentColor,
} from "@shared/preferences/accent";
import { Field, Input } from "./Input";
import { AnchoredPopover } from "../overlays/PopoverSurface";
import { cx } from "../cx";
import { CheckIcon } from "../icons";

export const IDENTITY_HUES = [
  {
    hue: 210,
    get name() {
      return t("huePicker.colors.blue");
    },
  },
  {
    hue: 330,
    get name() {
      return t("huePicker.colors.pink");
    },
  },
  {
    hue: 150,
    get name() {
      return t("huePicker.colors.green");
    },
  },
  {
    hue: 45,
    get name() {
      return t("huePicker.colors.amber");
    },
  },
  {
    hue: 285,
    get name() {
      return t("huePicker.colors.violet");
    },
  },
  {
    hue: 190,
    get name() {
      return t("huePicker.colors.teal");
    },
  },
  {
    hue: 20,
    get name() {
      return t("huePicker.colors.rust");
    },
  },
] as const;

export const swatchColor = (hue: AccentColor) =>
  typeof hue === "string"
    ? hue
    : `oklch(${ACCENT_SWATCH_LIGHTNESS} ${DEFAULT_ACCENT_CHROMA} ${hue})`;

export interface HuePickerProps {
  label?: string;
  value: AccentColor;
  onChange: (hue: AccentColor) => Promise<boolean> | void;
  className?: string;
}

export function HuePicker({
  value,
  onChange,
  className,
  label = t("huePicker.identityColor"),
}: HuePickerProps) {
  const name = useId();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLLabelElement>(null);
  const customRadio = useRef<HTMLInputElement>(null);
  const nativePicker = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string>(() => accentToHex(value));
  const lastRequested = useRef<AccentColor>(value);

  const commit = (next: string) => {
    if (!isHexColor(next)) return;

    const color = accentToHex(next);

    if (
      lastRequested.current === color ||
      (lastRequested.current === value && color === accentToHex(value))
    )
      return;

    lastRequested.current = color;

    void Promise.resolve(onChange(color)).then((saved) => {
      if (saved === false && lastRequested.current === color) lastRequested.current = value;
    });
  };

  const commitLatest = useRef(commit);

  commitLatest.current = commit;

  useEffect(() => {
    setDraft(accentToHex(value));
    lastRequested.current = value;
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const picker = nativePicker.current;
    if (!picker) return;
    const accept = () => commitLatest.current(picker.value);
    picker.addEventListener("change", accept);
    return () => picker.removeEventListener("change", accept);
  }, [open]);

  const close = () => {
    if (draft.toLowerCase() !== accentToHex(value)) commit(draft.trim());
    setOpen(false);
    customRadio.current?.focus();
  };

  const custom = open || !IDENTITY_HUES.some((option) => value === option.hue);
  const hex = draft.trim();
  const valid = isHexColor(hex);

  return (
    <div className={cx("space-y-3", className)}>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {IDENTITY_HUES.map((option) => {
          const selected = !open && value === option.hue;

          return (
            <label
              key={option.hue}
              title={option.name}
              className="relative shrink-0 cursor-pointer"
            >
              <input
                type="radio"
                name={name}
                value={option.hue}
                checked={selected}
                onChange={() => {
                  setOpen(false);
                  setDraft(accentToHex(option.hue));
                  void onChange(option.hue);
                }}
                aria-label={option.name}
                className="peer sr-only"
              />

              <span
                style={{ backgroundColor: swatchColor(option.hue) }}
                className={cx(
                  "ui-hue grid size-[32px] place-items-center rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                  selected &&
                    "text-text-primary shadow-[0_0_0_2px_var(--color-ring-gap,var(--bg-overlay)),0_0_0_4px_currentColor]",
                )}
              >
                {selected && (
                  <CheckIcon
                    aria-hidden
                    strokeWidth={3}
                    style={{ color: "var(--on-identity-fill)" }}
                    className="size-3.5"
                  />
                )}
              </span>
            </label>
          );
        })}

        <label
          ref={trigger}
          title={t("huePicker.custom")}
          className="relative shrink-0 cursor-pointer"
        >
          <input
            ref={customRadio}
            type="radio"
            name={name}
            value="custom"
            checked={custom}
            onChange={() => {}}
            onClick={() => {
              if (open) close();
              else {
                setDraft(accentToHex(value));
                setOpen(true);
              }
            }}
            aria-label={t("huePicker.custom")}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? `${name}-custom` : undefined}
            className="peer sr-only"
          />

          <span
            style={{
              background:
                custom && valid
                  ? open
                    ? hex
                    : swatchColor(value)
                  : "conic-gradient(#ee7676, #e2c66d, #79b78b, #71b4c9, #a38acb, #ee7676)",
            }}
            className={cx(
              "ui-hue grid size-[32px] place-items-center rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
              custom &&
                "text-text-primary shadow-[0_0_0_2px_var(--color-ring-gap,var(--bg-overlay)),0_0_0_4px_currentColor]",
            )}
          >
            <Palette size={16} aria-hidden="true" className="text-white drop-shadow-sm" />
          </span>
        </label>
      </div>

      {open && (
        <AnchoredPopover
          anchorRef={trigger}
          gap={8}
          returnFocusRef={customRadio}
          id={`${name}-custom`}
          role="dialog"
          aria-label={t("huePicker.customAccentColor")}
          onClose={close}
          className="w-[300px] space-y-3 p-3"
        >
          <div className="space-y-3">
            <div className="flex items-end gap-3">
              <label className="flex shrink-0 flex-col gap-1.5 text-sm font-medium">
                {t("huePicker.custom")}

                <input
                  ref={nativePicker}
                  id={`${name}-native`}
                  type="color"
                  aria-label={t("huePicker.chooseCustomAccentColor")}
                  value={valid ? hex : accentToHex(value)}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={(event) => commit(event.target.value)}
                  className="h-9 w-11 cursor-pointer rounded-sm border border-control-border bg-bg-raised p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
                />
              </label>

              <div className="min-w-0 flex-1">
                <Field label={t("huePicker.hexColor")}>
                  {(props) => (
                    <Input
                      {...props}
                      autoFocus
                      mono
                      value={draft}
                      maxLength={7}
                      invalid={!valid}
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(event) => {
                        setDraft(event.target.value);
                        commit(event.target.value.trim());
                      }}
                      onBlur={(event) => commit(event.target.value.trim())}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commit(hex);
                          close();
                        }
                      }}
                    />
                  )}
                </Field>
              </div>
            </div>

            {!valid && (
              <p role="alert" className="text-xs text-git-deleted">
                {t("huePicker.enterASixDigitHexColorLike3b82f6")}
              </p>
            )}

            <p className="text-xs text-text-tertiary">
              {t("huePicker.colorsAdaptToLightAndDarkThemes")}
            </p>
          </div>
        </AnchoredPopover>
      )}
    </div>
  );
}
