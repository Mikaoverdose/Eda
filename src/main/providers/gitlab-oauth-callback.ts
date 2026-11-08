import { errorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import { createServer, type Server } from "node:http";

export class GitLabOAuthCallback {
  private server: Server | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;

  constructor(
    private readonly redirectUri: string,
    private readonly state: string,
    private readonly received: (code?: string, error?: string) => void,
  ) {}

  async listen(): Promise<void> {
    const target = new URL(this.redirectUri);
    const server = createServer((request, response) => {
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("Connection", "close");
      if (!URL.canParse(request.url ?? "/", target.origin)) {
        response.writeHead(400);
        response.end(t("main.providers.gitlabAuth.callbackInvalid"));
        return;
      }
      const url = new URL(request.url ?? "/", target.origin);
      if (
        this.closed ||
        request.method !== "GET" ||
        request.headers.host !== target.host ||
        url.origin !== target.origin ||
        url.pathname !== target.pathname ||
        url.searchParams.getAll("state").length !== 1 ||
        url.searchParams.get("state") !== this.state ||
        url.searchParams.getAll("code").length > 1 ||
        url.searchParams.getAll("error").length > 1
      ) {
        response.writeHead(400);
        response.end(t("main.providers.gitlabAuth.callbackInvalid"));
        return;
      }
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      if (
        (!code && !error) ||
        (code && error) ||
        (code && (code.length > 4096 || /[\s\0]/.test(code)))
      ) {
        response.writeHead(400);
        response.end(t("main.providers.gitlabAuth.callbackInvalid"));
        return;
      }
      response.end(t("main.providers.gitlabAuth.callbackReceived"));
      this.close();
      this.received(code ?? undefined, error ?? undefined);
    });
    this.server = server;
    server.requestTimeout = 5000;
    server.headersTimeout = 5000;
    server.keepAliveTimeout = 1;
    server.maxConnections = 10;
    server.maxRequestsPerSocket = 1;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(Number(target.port), "127.0.0.1", () => {
          server.removeListener("error", reject);
          if (this.closed) {
            server.close();
            reject();
          } else resolve();
        });
      });
    } catch {
      this.close();
      throw new GitError({
        kind: "network-failed",
        operation: t("operations.gitLabSignIn"),
        message: errorText("main.providers.gitlabAuth.callbackUnavailable"),
      });
    }
    this.timer = setTimeout(() => this.close(), 10 * 60_000);
    this.timer.unref();
    server.unref();
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.server?.close();
    this.server?.closeIdleConnections();
  }
}
