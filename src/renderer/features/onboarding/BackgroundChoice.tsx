import { errorMessage } from "@shared/errors";
import { t } from "@shared/i18n";
import type { BackgroundPreference } from "@shared/preferences/settings";
import { ImagePlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AsyncButton, Button } from "../../components/ui/index";
import { previewBackground } from "../../stores/preferences-store";
import { BackgroundImageControls } from "../settings/appearance/BackgroundImageControls";

export function BackgroundChoice({
  value,
  onChange,
}: {
  value: BackgroundPreference;
  onChange: (value: BackgroundPreference) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [lastImage, setLastImage] = useState(value.image);

  useEffect(() => {
    if (value.image) setLastImage(value.image);
  }, [value.image]);

  return (
    <div className="space-y-2 border-t border-border-subtle pt-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">
          {t("onboarding.backgroundChoice.background")}
          <span className="ml-1 text-xs font-normal text-text-tertiary">
            {t("onboarding.backgroundChoice.optional")}
          </span>
        </h2>
        <AsyncButton
          size="sm"
          label={t("onboarding.backgroundChoice.chooseBackgroundImage")}
          icon={<ImagePlus size={14} />}
          onAction={async () => {
            const result = await window.eda.settings.chooseBackgroundImage();

            if (!result.ok) {
              setError(errorMessage(result.error));
              return false;
            }

            setError(null);

            if (result.value) onChange({ ...value, image: result.value });

            return true;
          }}
        >
          {value.image
            ? t("onboarding.backgroundChoice.changeImage")
            : t("onboarding.backgroundChoice.chooseImage")}
        </AsyncButton>
      </div>
      {error && (
        <p role="alert" className="text-xs text-git-deleted">
          {error}
        </p>
      )}
      <div className="relative">
        {!value.image && (
          <div className="onboarding-background-empty absolute inset-0 flex items-center text-xs text-text-tertiary">
            {t("onboarding.backgroundChoice.noImageSelected")}
          </div>
        )}
        <div
          className="onboarding-background-controls grid min-h-14 grid-cols-[40px_1fr_1fr_28px] items-center gap-3"
          data-visible={!!value.image}
          inert={!value.image}
          aria-hidden={!value.image}
        >
          <img
            src={value.image || lastImage || undefined}
            alt={t("onboarding.backgroundChoice.selectedBackground")}
            className="size-10 rounded-sm object-cover"
          />
          <BackgroundImageControls
            value={value}
            strengthLabel={t("onboarding.backgroundChoice.strength")}
            blurLabel={t("onboarding.backgroundChoice.blur")}
            onPreview={previewBackground}
            onCancel={() => previewBackground(value)}
            onCommit={onChange}
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={t("onboarding.backgroundChoice.removeImage")}
            title={t("onboarding.backgroundChoice.removeImage")}
            onClick={() => onChange({ ...value, image: "" })}
          >
            <X size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
