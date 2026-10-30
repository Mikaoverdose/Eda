import type {
  ProcessRequest,
  ProcessResult,
  ProcessRunner,
} from "@main/git/execution/process-runner";

export interface FakeResponse {
  exitCode?: number;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  cancelled?: boolean;
  stderrLines?: readonly string[];
  outputLimitExceeded?: "stdout" | "stderr";
}

type Matcher = (request: ProcessRequest) => boolean;

interface Rule {
  matcher: Matcher;
  response: FakeResponse;
}

export class FakeProcessRunner implements ProcessRunner {
  readonly calls: ProcessRequest[] = [];
  private readonly rules: Rule[] = [];
  private fallback: FakeResponse | undefined;

  on(argsPrefix: readonly string[], response: FakeResponse): this {
    return this.when(
      (request) =>
        argsPrefix.length <= request.args.length &&
        argsPrefix.every((arg, i) => request.args[i] === arg),
      response,
    );
  }

  when(matcher: Matcher, response: FakeResponse): this {
    this.rules.push({ matcher, response });
    return this;
  }

  otherwise(response: FakeResponse): this {
    this.fallback = response;
    return this;
  }

  get lastCall(): ProcessRequest | undefined {
    return this.calls.at(-1);
  }

  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.calls.push(request);

    const response = this.rules.find((rule) => rule.matcher(request))?.response ?? this.fallback;

    if (!response) {
      throw new Error(
        `FakeProcessRunner: no rule matched.\n  ${request.executable} ${request.args.join(" ")}\n` +
          `Add one with .on([...], {...}) or .otherwise({...}).`,
      );
    }

    if (request.signal?.aborted) {
      return { exitCode: 130, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), cancelled: true };
    }

    for (const line of response.stderrLines ?? []) {
      request.onStderrLine?.(line);
    }

    return {
      exitCode: response.exitCode ?? 0,
      stdout: toBuffer(response.stdout),
      stderr: toBuffer(response.stderr),
      cancelled: response.cancelled ?? false,
      ...(response.outputLimitExceeded !== undefined && {
        outputLimitExceeded: response.outputLimitExceeded,
      }),
    };
  }
}

function toBuffer(value: string | Buffer | undefined): Buffer {
  if (value === undefined) return Buffer.alloc(0);
  return Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
}
