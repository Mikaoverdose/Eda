import { describe, expect, it, vi } from "vitest";
import { readResponseBytes } from "@main/network/response";

function stream(chunks: number[][], cancel = vi.fn()) {
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks.shift();
      if (chunk) controller.enqueue(Uint8Array.from(chunk));
      else controller.close();
    },
    cancel,
  });
}

const tooLarge = () => new Error("response too large");

describe("bounded response reads", () => {
  it("preserves chunk boundaries as bytes and accepts the exact size limit", async () => {
    const body = stream([[0, 1], [255], [2, 3]]);

    expect(await readResponseBytes(body, 5, tooLarge)).toEqual(Buffer.from([0, 1, 255, 2, 3]));
    expect(body.locked).toBe(false);
  });

  it("cancels oversized streams without hiding the size error if cancellation fails", async () => {
    const cancel = vi.fn(async () => {
      throw new Error("cancellation failed");
    });

    const body = stream(
      [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
      cancel,
    );

    await expect(readResponseBytes(body, 3, tooLarge)).rejects.toThrow("response too large");
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it("keeps the original stream error and releases the reader", async () => {
    const failure = new Error("connection interrupted");

    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(failure);
      },
    });

    await expect(readResponseBytes(body, 10, tooLarge)).rejects.toBe(failure);
    expect(body.locked).toBe(false);
  });
});
