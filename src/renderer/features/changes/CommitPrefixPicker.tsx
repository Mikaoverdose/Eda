import { t } from "@shared/i18n";
import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { Button, SearchField } from "../../components/ui/index";
import { PopoverSurface } from "../../components/ui/overlays/PopoverSurface";

export function CommitPrefixPicker({
  value,
  prefixes,
  disabled,
  onChange,
}: {
  value: string;
  prefixes: string[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [position, setPosition] = useState<DOMRect | null>(null);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const optionButtons = useRef(new Map<string, HTMLButtonElement>());
  const id = useId();
  const close = () => {
    setPosition(null);
    trigger.current?.focus();
  };
  const options = [
    ...prefixes.filter((prefix) =>
      prefix.toLowerCase().includes(query.toLowerCase().replace(/:\s*$/, "")),
    ),
    "",
  ];

  return (
    <>
      <span className="max-w-[45%] shrink-0">
        <Button
          ref={trigger}
          className="max-w-full"
          aria-label={t("commitPrefixPicker.commitPrefix")}
          aria-haspopup="dialog"
          aria-expanded={!!position}
          aria-controls={position ? id : undefined}
          disabled={disabled}
          onClick={() => {
            if (position) close();
            else {
              setQuery("");
              setPosition(trigger.current!.getBoundingClientRect());
            }
          }}
        >
          {value ? `${value}:` : t("commitPrefixPicker.noPrefix")}
          <ChevronDown size={14} aria-hidden="true" />
        </Button>
      </span>
      {position &&
        !disabled &&
        createPortal(
          <PopoverSurface
            returnFocusRef={trigger}
            id={id}
            role="dialog"
            aria-label={t("commitPrefixPicker.chooseCommitPrefix")}
            onClose={close}
            className="fixed w-56 p-1"
            style={{
              left: Math.max(8, Math.min(position.left, window.innerWidth - 232)),
              bottom: window.innerHeight - position.top + 4,
            }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

              event.preventDefault();

              const fields = [
                search.current,
                ...options.map((prefix) => optionButtons.current.get(prefix)),
              ].filter((element): element is HTMLInputElement | HTMLButtonElement => !!element);
              const index = fields.findIndex((element) => element === event.target);

              fields[
                (index + (event.key === "ArrowDown" ? 1 : -1) + fields.length) % fields.length
              ]?.focus();
            }}
          >
            <SearchField
              ref={search}
              autoFocus
              aria-label={t("commitPrefixPicker.searchCommitPrefixes")}
              placeholder={t("commitPrefixPicker.searchPrefixes")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onChange(options[0]!);
                  close();
                }
              }}
            />
            <div className="mt-1 max-h-56 overflow-y-auto">
              {options.map((prefix) => (
                <Button
                  key={prefix}
                  ref={(element) => {
                    if (element) optionButtons.current.set(prefix, element);
                    else optionButtons.current.delete(prefix);
                  }}
                  variant="ghost"
                  block
                  data-eda-select-value={prefix}
                  aria-pressed={value === prefix}
                  className="ui-select-option flex min-h-8 w-full items-center justify-between rounded-sm px-2 text-left text-sm hover:bg-accent-muted focus-visible:bg-accent-muted"
                  onClick={() => {
                    onChange(prefix);
                    close();
                  }}
                >
                  {prefix ? `${prefix}:` : t("commitPrefixPicker.noPrefix")}
                  {value === prefix && <Check size={14} aria-hidden="true" />}
                </Button>
              ))}
            </div>
          </PopoverSurface>,
          document.body,
        )}
    </>
  );
}
