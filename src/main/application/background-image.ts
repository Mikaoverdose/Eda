import { errorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import { MAX_BACKGROUND_IMAGE_LENGTH } from "@shared/preferences/settings";
import { nativeImage } from "electron";
import { realpath } from "node:fs/promises";
import { readRegularFile } from "../filesystem/read-regular-file";

export async function readBackgroundImage(path: string): Promise<string> {
  const { bytes } = await readRegularFile(
    await realpath(path),
    12 * 1024 * 1024,
    () =>
      new GitError({
        kind: "invalid-input",
        operation: t("operations.validateRequest"),
        message: errorText("main.settingsHandlers.chooseAnImageFileSmallerThan12Mb"),
      }),
  );

  let image = nativeImage.createFromBuffer(bytes);

  if (image.isEmpty())
    throw new GitError({
      kind: "invalid-input",
      operation: t("operations.validateRequest"),
      message: errorText(
        "main.settingsHandlers.thisImageCouldNotBeOpenedChooseApngjpegOrWebPImage",
      ),
    });

  const size = image.getSize();

  if (Math.max(size.width, size.height) > 1920)
    image = image.resize(size.width >= size.height ? { width: 1920 } : { height: 1920 });

  const data = "data:image/jpeg;base64," + image.toJPEG(75).toString("base64");

  if (data.length > MAX_BACKGROUND_IMAGE_LENGTH)
    throw new GitError({
      kind: "invalid-input",
      operation: t("operations.validateRequest"),
      message: errorText("main.settingsHandlers.thisImageIsTooDetailedChooseASmallerImage"),
    });

  return data;
}
