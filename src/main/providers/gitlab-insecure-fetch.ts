import { createHash } from "node:crypto";
import { session } from "electron";
import { GitError } from "@shared/errors";
import { errorText } from "@shared/error-codes";
import { t } from "@shared/i18n";

export function createGitLabInsecureFetch(baseUrl: string): typeof globalThis.fetch {
  const base = new URL(baseUrl);
  const key = createHash("sha256").update(baseUrl).digest("hex");
  const isolated = session.fromPartition(`gitlab-insecure:${key}`, { cache: false });
  const hostname = base.hostname.replace(/^\[|\]$/g, "");

  isolated.setCertificateVerifyProc((request, callback) => {
    callback(request.hostname === hostname ? 0 : -3);
  });

  return async (input, options) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );

    const prefix = base.pathname.replace(/\/$/, "") + "/";

    if (url.origin !== base.origin || !url.pathname.startsWith(prefix))
      throw new GitError({
        kind: "invalid-input",
        operation: t("operations.gitLabSignIn"),
        message: errorText("main.providers.gitlabSelfHosted.invalidUrl"),
      });

    return isolated.fetch(url.href, { ...options, redirect: "error", credentials: "omit" });
  };
}
