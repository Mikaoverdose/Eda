import { StringDecoder } from "node:string_decoder";
import { Transform } from "node:stream";

export function electronStderr(allDiagnostics = false): Transform {
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let reported = false;
  const timing =
    /^\[\d+:\d+(?::\d+)?\/[^\]\r\n]+:ERROR:components\/viz\/service\/display\/display\.cc:\d+\]\s*:?[ \t]*Frame latency is negative: -\d+(?:\.\d+)? ms\r?\n?$/;
  const forward = (stream: Transform, line: string) => {
    if (!allDiagnostics && timing.test(line)) {
      if (reported) return;
      reported = true;
      stream.push(line);
      stream.push(
        "[Eda graphics] Repeated Chromium frame-timing messages omitted; EDA_CHROMIUM_DIAGNOSTICS=1 shows all.\n",
      );
    } else stream.push(line);
  };
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      pending += decoder.write(chunk);
      let newline: number;
      while ((newline = pending.indexOf("\n")) !== -1) {
        forward(this, pending.slice(0, newline + 1));
        pending = pending.slice(newline + 1);
      }
      if (pending.length > 64 * 1024) {
        this.push(pending);
        pending = "";
      }
      done();
    },
    flush(done) {
      forward(this, pending + decoder.end());
      done();
    },
  });
}
