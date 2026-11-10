import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";

export async function readRegularFile(
  path: string,
  limit: number,
  invalid: (reason: "type" | "size" | "changed") => Error,
) {
  const entry = await lstat(path);
  if (!entry.isFile()) throw invalid("type");
  if (entry.size > limit) throw invalid("size");

  const handle = await open(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
  );

  try {
    const sameFile = (info: typeof entry) =>
      info.isFile() &&
      info.dev === entry.dev &&
      info.ino === entry.ino &&
      info.size === entry.size &&
      info.ctimeMs === entry.ctimeMs;

    if (!sameFile(await handle.stat())) throw invalid("changed");
    const buffer = Buffer.alloc(entry.size + 1);
    let length = 0;

    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }

    if (length !== entry.size || !sameFile(await handle.stat())) throw invalid("changed");
    return { bytes: buffer.subarray(0, length), entry };
  } finally {
    await handle.close();
  }
}
