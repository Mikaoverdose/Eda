import { request } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { INTEGRATIONS } from "@shared/integrations/config";
import { GitLabOAuthCallback } from "@main/providers/gitlab-oauth-callback";

const listeners: GitLabOAuthCallback[] = [];
afterEach(() => {
  for (const listener of listeners.splice(0)) listener.close();
});
const base = INTEGRATIONS.gitlab.redirectUri;
function get(url: string, options: { method?: string; headers?: Record<string, string> } = {}) {
  return new Promise<{ status: number; text: string; headers: Record<string, unknown> }>(
    (resolve, reject) => {
      const req = request(url, options, (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () =>
          resolve({ status: response.statusCode!, text, headers: response.headers }),
        );
      });
      req.on("error", reject);
      req.end();
    },
  );
}
function create(received = vi.fn()) {
  const listener = new GitLabOAuthCallback(base, "private-state", received);
  listeners.push(listener);
  return { listener, received };
}

it("rejects malformed, wrong-state, wrong-host, duplicate and unrelated callbacks without consuming the login", async () => {
  const { listener, received } = create();
  await listener.listen();
  for (const [url, options] of [
    [base + "?state=wrong&code=private-code", {}],
    [base + "?state=private-state&state=private-state&code=private-code", {}],
    [base + "?state=private-state&code=a&code=b", {}],
    [base + "?state=private-state&code=a&error=access_denied", {}],
    [base + "?state=private-state&code=private-code", { method: "POST" }],
    [base + "?state=private-state&code=private-code", { headers: { Host: "evil.test" } }],
    [base.replace("/callback", "/other") + "?state=private-state&code=private-code", {}],
  ] as const) {
    const response = await get(url, options);
    expect(response.status).toBe(400);
    expect(response.text).not.toContain("private-code");
    expect(received).not.toHaveBeenCalled();
  }
  const response = await get(base + "?state=private-state&code=private-code");
  expect(response.status).toBe(200);
  expect(response.text).not.toContain("private-code");
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.headers["referrer-policy"]).toBe("no-referrer");
  expect(received).toHaveBeenCalledExactlyOnceWith("private-code", undefined);
});

it("handles denial without a code and releases the callback port", async () => {
  const { listener, received } = create();
  await listener.listen();
  await get(base + "?state=private-state&error=access_denied");
  expect(received).toHaveBeenCalledExactlyOnceWith(undefined, "access_denied");
  const next = create();
  await expect(next.listener.listen()).resolves.toBeUndefined();
});

it("reports an occupied callback port and lets cancellation release the listener", async () => {
  const first = create();
  await first.listener.listen();
  const second = create();
  await expect(second.listener.listen()).rejects.toMatchObject({ kind: "network-failed" });
  first.listener.close();
  const third = create();
  await expect(third.listener.listen()).resolves.toBeUndefined();
});
