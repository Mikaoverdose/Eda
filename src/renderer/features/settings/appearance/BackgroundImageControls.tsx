import { MAX_BACKGROUND_BLUR, type BackgroundPreference } from "@shared/preferences/settings";

import { RangeField } from "../../../components/ui/forms/RangeField";

export function BackgroundImageControls({
  value,
  strengthLabel,
  blurLabel,
  onPreview,
  onCancel,
  onCommit,
}: {
  value: BackgroundPreference;
  strengthLabel: string;
  blurLabel: string;
  onPreview: (next: BackgroundPreference) => void;
  onCancel: () => void;
  onCommit: (next: BackgroundPreference) => void | Promise<boolean>;
}) {
  return (
    <>
      <RangeField
        label={strengthLabel}
        value={value.strength}
        onPreview={(strength) => onPreview({ ...value, strength })}
        onCancel={onCancel}
        onCommit={(strength) => onCommit({ ...value, strength })}
      />
      <RangeField
        label={blurLabel}
        value={value.blur}
        max={MAX_BACKGROUND_BLUR}
        unit="px"
        onPreview={(blur) => onPreview({ ...value, blur })}
        onCancel={onCancel}
        onCommit={(blur) => onCommit({ ...value, blur })}
      />
    </>
  );
}
