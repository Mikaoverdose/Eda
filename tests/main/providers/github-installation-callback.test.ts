import { afterEach, expect, it, vi } from "vitest";
import { request } from "node:http";
import { GitHubInstallationCallback } from "@main/providers/github-installation-callback";

const servers: GitHubInstallationCallback[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});
function setup() {
  let now = Date.now();
  const completed = vi.fn();
  const server = new GitHubInstallationCallback(completed, () => now, 0);
  servers.push(server);
  return {
    server,
    completed,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
function get(url: string, host?: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    request(url, host ? { headers: { Host: host } } : {}, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    })
      .on("error", reject)
      .end();
  });
}
it("accepts only the one-time state for the local pending profile", async () => {
  const { server, completed } = setup();
  const state = await server.begin("work");
  const url = `${server.url}?state=${state}&installation_id=123`;
  expect(await get(`${server.url}?state=${"0".repeat(64)}`)).toBe(400);
  expect(await get(`${url}&state=${state}`)).toBe(400);
  expect(await get(url, "attacker.invalid")).toBe(400);
  expect(completed).not.toHaveBeenCalled();
  expect(await get(url)).toBe(200);
  expect(completed).toHaveBeenCalledExactlyOnceWith("work");
  expect(await get(url)).toBe(400);
});
it("invalidates cancelled, superseded, and expired callbacks", async () => {
  const { server, completed, advance } = setup();
  const old = await server.begin("work");
  const current = await server.begin("personal");
  expect(await get(`${server.url}?state=${old}`)).toBe(400);
  server.cancel("work");
  expect(await get(`${server.url}?state=${current}`)).toBe(200);
  const cancelled = await server.begin("work");
  server.cancel("work");
  expect(await get(`${server.url}?state=${cancelled}`)).toBe(400);
  const expired = await server.begin("work");
  advance(15 * 60_000);
  expect(await get(`${server.url}?state=${expired}`)).toBe(400);
  expect(completed).toHaveBeenCalledExactlyOnceWith("personal");
});
