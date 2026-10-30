import { getLocale, t } from "@shared/i18n";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { GITHUB_INSTALLATION_WAIT_MS } from "@shared/integrations/github";

export class GitHubInstallationCallback {
  private server: Server | undefined;
  private pending: { profileId: string; state: string; expiresAt: number } | undefined;

  constructor(
    private readonly completed: (profileId: string) => void,
    private readonly now = Date.now,
    private readonly port = 43817,
  ) {}

  get url(): string {
    const address = this.server?.address();
    const port = address && typeof address !== "string" ? address.port : this.port;
    return `http://127.0.0.1:${port}/github/install`;
  }

  async begin(profileId: string): Promise<string> {
    this.pending = undefined;
    if (!this.server) {
      const server = createServer((request, response) => {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
        response.setHeader("Referrer-Policy", "no-referrer");
        let url: URL;
        try {
          url = new URL(request.url ?? "/", this.url);
        } catch {
          response.writeHead(400).end();
          return;
        }
        const state = url.searchParams.get("state") ?? "";
        const pending = this.pending;
        if (
          request.method !== "GET" ||
          request.headers.host !== new URL(this.url).host ||
          url.origin !== new URL(this.url).origin ||
          url.pathname !== "/github/install" ||
          url.searchParams.getAll("state").length !== 1 ||
          !/^[a-f0-9]{64}$/.test(state) ||
          !pending ||
          pending.expiresAt <= this.now() ||
          !timingSafeEqual(Buffer.from(state), Buffer.from(pending.state))
        ) {
          response
            .writeHead(400)
            .end(callbackPage(t("main.providers.githubInstallationCallback.expired")));
          return;
        }
        this.pending = undefined;
        response
          .writeHead(200)
          .end(callbackPage(t("main.providers.githubInstallationCallback.received")));
        this.completed(pending.profileId);
      });
      this.server = server;
      try {
        await new Promise<void>((resolve, reject) => {
          const failed = (error: Error) => reject(error);
          server.once("error", failed);
          server.listen(this.port, "127.0.0.1", () => {
            server.removeListener("error", failed);
            resolve();
          });
        });
        server.unref();
      } catch (error) {
        this.server = undefined;
        server.close();
        throw error;
      }
    }
    const state = randomBytes(32).toString("hex");
    this.pending = { profileId, state, expiresAt: this.now() + GITHUB_INSTALLATION_WAIT_MS };
    return state;
  }

  cancel(profileId: string): void {
    if (this.pending?.profileId === profileId) this.pending = undefined;
  }

  close(): void {
    this.pending = undefined;
    this.server?.closeAllConnections();
    this.server?.close();
    this.server = undefined;
  }
}

function callbackPage(message: string): string {
  const escaped = message.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character]!;
  });
  return `<!doctype html><html lang="${getLocale()}"><meta charset="utf-8"><title>Eda</title><body>${escaped}</body></html>`;
}
