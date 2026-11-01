import { errorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import type { SshHostPrompt } from "@shared/identity/ssh";
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { ProcessRequest, ProcessResult, ProcessRunner } from "../execution/process-runner";

export type ConfirmSshHost = (prompt: SshHostPrompt, signal: AbortSignal) => Promise<boolean>;

export function parseSshHostPrompt(prompt: string): SshHostPrompt | null {
  if (prompt.length > 16_384 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(prompt)) return null;
  const host = /^The authenticity of host '([^'\r\n]+)' can't be established/.exec(prompt)?.[1];
  const key =
    /(?:^|\n)([A-Z0-9-]+) key fingerprint is:? (SHA256:[A-Za-z0-9+/]{43}=?)(?![A-Za-z0-9+/=])/.exec(
      prompt,
    );
  if (!host || !key || !prompt.includes("Are you sure you want to continue connecting"))
    return null;
  return { host, algorithm: key[1]!, fingerprint: key[2]! };
}

const askpassScript = `#!/bin/sh
umask 077
request=$(mktemp -d "$EDA_SSH_TRUST_DIR/request.XXXXXXXX") || exit 1
printf '%s' "$1" > "$request/prompt" || exit 1
: > "$request/ready"
attempt=0
while [ -d "$EDA_SSH_TRUST_DIR" ] && [ "$attempt" -lt 3000 ]; do
  if [ -f "$request/answer" ]; then
    answer=$(cat "$request/answer")
    [ "$answer" = yes ] || exit 1
    printf '%s\\n' yes
    exit 0
  fi
  sleep 0.1
  attempt=$((attempt + 1))
done
exit 1
`;

export class SshHostTrustRunner implements ProcessRunner {
  private confirmationQueue = Promise.resolve();

  constructor(
    private readonly runner: ProcessRunner,
    private readonly confirm: ConfirmSshHost,
  ) {}

  async run(request: ProcessRequest): Promise<ProcessResult> {
    if (request.env["EDA_SSH_HOST_TRUST"] !== "1") return this.runner.run(request);

    const directory = await mkdtemp(join(tmpdir(), "eda-host-trust-"));
    const script = join(directory, "askpass.sh");
    const controller = new AbortController();
    const signal = request.signal
      ? AbortSignal.any([controller.signal, request.signal])
      : controller.signal;
    let declined = false;
    const seen = new Set<string>();
    let watching: Promise<void> | undefined;

    try {
      await writeFile(script, askpassScript, { mode: 0o700 });
      const answer = async (path: string) => {
        const prompt = parseSshHostPrompt(await readFile(join(path, "prompt"), "utf8"));
        const approved = prompt ? await this.confirmQueued(prompt, signal) : false;
        if (signal.aborted) return;
        if (prompt && !approved) declined = true;
        await writeFile(join(path, "decision"), approved ? "yes" : "no", { mode: 0o600 });
        await rename(join(path, "decision"), join(path, "answer"));
      };
      watching = (async () => {
        try {
          while (!signal.aborted) {
            for (const name of await readdir(directory)) {
              if (!/^request\.[A-Za-z0-9]{8}$/.test(name) || seen.has(name)) continue;
              const path = join(directory, name);
              if (!(await readdir(path)).includes("ready")) continue;
              seen.add(name);
              await answer(path);
            }
            await delay(40, undefined, { signal });
          }
        } catch (error) {
          if (!signal.aborted) {
            controller.abort();
            throw error;
          }
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      })();
      // Attach a handler now so watcher failures don't become unhandled rejections.
      void watching.catch(() => {});
      const env = {
        ...request.env,
        SSH_ASKPASS: script.replaceAll("\\", "/"),
        SSH_ASKPASS_REQUIRE: "force",
        EDA_SSH_TRUST_DIR: directory.replaceAll("\\", "/"),
        DISPLAY: request.env["DISPLAY"] ?? ":0",
      };
      const result = await this.runner.run({ ...request, env, signal });
      if (declined)
        throw new GitError({
          kind: "cancelled",
          operation: t("operations.verifySshHost"),
          message: errorText(
            "main.git.sshHostTrust.theSshHostWasNotTrustedTheConnectionWasCancelled",
          ),
        });
      return result;
    } finally {
      controller.abort();
      try {
        await watching;
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  }

  private confirmQueued(prompt: SshHostPrompt, signal: AbortSignal): Promise<boolean> {
    const pending = this.confirmationQueue.then(async () => {
      if (signal.aborted) return false;
      const timeout = AbortSignal.any([signal, AbortSignal.timeout(300_000)]);
      return decisionUntilAborted(() => this.confirm(prompt, timeout), timeout);
    });
    this.confirmationQueue = pending.then(
      () => {},
      () => {},
    );
    return decisionUntilAborted(() => pending, signal);
  }
}

function decisionUntilAborted(work: () => Promise<boolean>, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  let abort = () => {};
  const cancelled = new Promise<boolean>((resolve) => {
    abort = () => resolve(false);
    signal.addEventListener("abort", abort, { once: true });
  });
  return Promise.race([
    Promise.resolve()
      .then(work)
      .then(
        (value) => value && !signal.aborted,
        () => false,
      ),
    cancelled,
  ]).finally(() => signal.removeEventListener("abort", abort));
}
