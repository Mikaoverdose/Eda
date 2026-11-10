export async function readResponseBytes(
  body: ReadableStream<Uint8Array>,
  limit: number,
  tooLarge: () => Error,
): Promise<Buffer> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;

      length += value.byteLength;
      if (length > limit) throw tooLarge();
      chunks.push(value);
    }

    return Buffer.concat(chunks, length);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
