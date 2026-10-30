import { chooseSelect } from "./select-control.ts";
import assert from "node:assert/strict";
import { _electron as electron, type ElectronApplication } from "playwright";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ChildProcess } from "node:child_process";

const root = await mkdtemp(join(tmpdir(), "eda-remotes-gate-"));
const config = join(root, "gitconfig");
const source = join(root, "source");
const remote = join(root, "remote.git");
const certificate = join(root, "certificate.pem");
const privateKey = join(root, "key.pem");
const opensslConfig = join(root, "openssl.cnf");
const env = {
  ...process.env,
  HOME: root,
  USERPROFILE: root,
  GIT_CONFIG_GLOBAL: config,
  GIT_CONFIG_SYSTEM: process.platform === "win32" ? "NUL" : "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_SSL_CAINFO: certificate,
  NODE_OPTIONS: "--no-warnings=ExperimentalWarning",
};

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...args], { env, encoding: "utf8", stdio: "pipe" }).trim();
const token = "eda-fixture-access-only";
const authorization = `Basic ${Buffer.from(`fixture:${token}`).toString("base64")}`;
const serverGit =
  process.env["EDA_SERVER_GIT"] ??
  (existsSync("C:/Program Files/Git/cmd/git.exe") ? "C:/Program Files/Git/cmd/git.exe" : "git");
let app: ElectronApplication | undefined;
let server: ReturnType<typeof createServer> | undefined;
let hold = false;
let heldRequests = 0;
let releaseHeldRequest: () => void;
const requestHeld = new Promise<void>((resolve) => {
  releaseHeldRequest = resolve;
});
const children = new Set<ChildProcess>();
const errors: string[] = [];

try {
  await writeFile(opensslConfig, "[req]\ndistinguished_name=dn\n[dn]\n");

  const windowsOpenSsl = "C:/Program Files/Git/usr/bin/openssl.exe";
  const openssl =
    process.env["EDA_OPENSSL"] ?? (existsSync(windowsOpenSsl) ? windowsOpenSsl : "openssl");

  execFileSync(
    openssl,
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      privateKey,
      "-out",
      certificate,
      "-days",
      "2",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1",
      "-config",
      opensslConfig,
    ],
    { stdio: "pipe", windowsHide: true },
  );
  await writeFile(
    config,
    `[user]\nname = Fixture\nemail = fixture@example.com\n[commit]\ngpgsign = false\n[http]\nsslBackend = openssl\nsslCAInfo = ${certificate.replaceAll("\\", "/")}\n`,
  );
  await mkdir(source);
  await mkdir(remote);
  git(remote, "init", "--bare", "-b", "main");
  git(remote, "config", "http.receivepack", "true");
  git(source, "init", "-b", "main");
  await writeFile(join(source, "file.txt"), "initial\n");
  git(source, "add", ".");
  git(source, "commit", "-m", "Initial history");
  git(source, "remote", "add", "origin", remote);
  git(source, "push", "origin", "main");
  server = createServer(
    { key: await readFile(privateKey), cert: await readFile(certificate) },
    (request, response) => {
      if (hold) {
        heldRequests++;
        releaseHeldRequest();
        request.resume();
        return;
      }

      if (request.headers.authorization !== authorization) {
        request.resume();
        response.writeHead(401, { "WWW-Authenticate": 'Basic realm="Eda fixture"' });
        response.end("Authentication required");
        return;
      }

      const url = new URL(request.url ?? "/", "https://127.0.0.1");
      const child = spawn(serverGit, ["http-backend"], {
        env: {
          ...env,
          GIT_PROJECT_ROOT: root,
          GIT_HTTP_EXPORT_ALL: "1",
          PATH_INFO: url.pathname,
          QUERY_STRING: url.search.slice(1),
          REQUEST_METHOD: request.method,
          CONTENT_TYPE: request.headers["content-type"] ?? "",
          CONTENT_LENGTH: request.headers["content-length"] ?? "",
          REMOTE_USER: "fixture",
          HTTP_GIT_PROTOCOL: request.headers["git-protocol"]?.toString() ?? "",
        },
        windowsHide: true,
      });

      children.add(child);
      request.pipe(child.stdin);
      child.stdin.on("error", () => {});

      const chunks: Buffer[] = [];

      child.stdout.on("data", (chunk) => chunks.push(chunk));
      child.stderr.on("data", () => {});
      child.on("error", () => {
        response.writeHead(500);
        response.end();
      });
      child.on("close", () => {
        children.delete(child);

        const output = Buffer.concat(chunks);
        const boundary = output.indexOf("\r\n\r\n");

        if (boundary < 0) {
          response.writeHead(500);
          response.end();
          return;
        }

        const headers: Record<string, string> = {};
        let status = 200;

        for (const line of output.subarray(0, boundary).toString().split("\r\n")) {
          const split = line.indexOf(":");
          if (split < 0) continue;
          const key = line.slice(0, split).toLowerCase();
          const value = line.slice(split + 1).trim();
          if (key === "status") status = Number(value.split(" ")[0]);
          else headers[key] = value;
        }

        response.writeHead(status, headers);
        response.end(output.subarray(boundary + 4));
      });
    },
  );
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));

  const address = server.address();

  assert.ok(address && typeof address !== "string");

  const url = `https://127.0.0.1:${address.port}/remote.git`;

  app = await electron.launch({
    args: ["dist/main/index.js", `--user-data-dir=${join(root, "user-data")}`],
    env,
  });

  const page = await app.firstWindow();

  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("button", { name: "Get started", exact: true }).click();
  await page.getByRole("textbox", { name: /^Profile name/ }).fill("Work");
  await page.getByRole("textbox", { name: /^Git author name/ }).fill("Fixture");
  await page.getByRole("textbox", { name: /^Git email/ }).fill("fixture@example.com");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("heading", { name: "Make Eda yours", exact: true }).waitFor();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Start using Eda", exact: true }).click();
  await page.getByRole("heading", { name: "Welcome to Eda.", exact: true }).waitFor();
  await page.getByRole("button", { name: "Open workspace", exact: true }).click();
  await page.getByRole("button", { name: "Clone repository", exact: true }).click();

  const clone = page.getByRole("dialog", { name: "Clone repository", exact: true });

  await clone.getByLabel("Repository URL", { exact: true }).fill(url);
  await clone.getByLabel("Clone parent folder").fill(root);
  await clone.getByLabel("Clone folder name").fill("cloned repo");
  await clone.getByText("HTTPS authentication", { exact: true }).click();
  await clone.getByLabel("HTTPS username").fill("fixture");
  await clone.getByLabel("HTTPS token").fill(token);
  await clone.getByRole("button", { name: "Clone repository", exact: true }).click();
  await clone.waitFor({ state: "hidden", timeout: 30000 });

  const cloneRecords = await page.evaluate(() => window.eda.operations.list());

  assert.ok(cloneRecords.ok, JSON.stringify(cloneRecords));
  assert.equal(
    cloneRecords.value?.find((record) => record.kind === "Clone repository")?.state,
    "succeeded",
    JSON.stringify(cloneRecords),
  );

  const clientPath = join(root, "cloned repo");

  assert.equal(git(clientPath, "log", "-1", "--format=%s"), "Initial history");
  assert.equal(git(clientPath, "remote", "get-url", "origin"), url);
  assert.doesNotMatch(
    await readFile(join(clientPath, ".git/config"), "utf8"),
    /Authorization|eda-fixture-access-only/,
  );

  const repository = await page.evaluate(async () => {
    const result = await window.eda.repository.list();
    if (!result.ok) throw new Error("Expected a successful IPC result: " + JSON.stringify(result));
    return result.value[0];
  });

  assert.ok(repository);

  await page.getByRole("button", { name: "Fetch options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Manage remotes…", exact: true }).click();
  const remoteSettings = page.locator("#settings-repository-remotes");
  await remoteSettings.getByLabel("Remote name").fill("backup");
  await remoteSettings.getByLabel("Remote URL").fill(remote);
  await remoteSettings.getByRole("button", { name: "Save remote", exact: true }).click();
  await remoteSettings.getByText("backup", { exact: true }).waitFor();
  assert.equal(resolve(git(clientPath, "remote", "get-url", "backup")), resolve(remote));
  await page.getByRole("button", { name: "Settings", exact: true }).click();

  const fetchAuthentication = page.getByRole("dialog", {
    name: "HTTPS authentication",
    exact: true,
  });
  await page.getByRole("button", { name: "Fetch", exact: true }).click();
  await fetchAuthentication.getByLabel("HTTPS username").fill("fixture");
  await fetchAuthentication.getByLabel("HTTPS token").fill("wrong-token");
  await fetchAuthentication.getByRole("button", { name: "Retry fetch", exact: true }).click();
  await fetchAuthentication.getByLabel("HTTPS token").fill(token);
  await fetchAuthentication.getByLabel("HTTPS username").fill("fixture");
  git(source, "branch", "topic");
  git(source, "push", "origin", "topic");
  await fetchAuthentication.getByRole("button", { name: "Retry fetch", exact: true }).click();
  await fetchAuthentication.waitFor({ state: "hidden" });
  await page
    .getByRole("status")
    .filter({ hasText: /Fetched origin/ })
    .first()
    .waitFor();
  assert.equal(await page.getByRole("dialog", { name: "Remotes", exact: true }).count(), 0);
  assert.equal(
    git(clientPath, "rev-parse", "refs/remotes/origin/topic"),
    git(source, "rev-parse", "topic"),
  );
  await page.getByRole("button", { name: "Remotes", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Remotes", exact: true });

  await dialog.getByRole("tab", { name: "Tracking", exact: true }).click();
  await chooseSelect(dialog.getByLabel("Upstream", { exact: true }), "refs/remotes/origin/topic");
  await dialog.getByRole("button", { name: "Set upstream", exact: true }).click();
  await dialog.getByText(/origin\/topic — up to date/).waitFor();
  assert.equal(git(clientPath, "config", "branch.main.merge"), "refs/heads/topic");

  await dialog.getByRole("tab", { name: "Push", exact: true }).click();
  await dialog.getByText("HTTPS authentication", { exact: true }).click();
  await dialog.getByLabel("HTTPS username").fill("fixture");
  await dialog.getByLabel("HTTPS token").fill(token);
  await dialog.getByLabel("Destination branch").fill("published");
  await dialog.getByRole("button", { name: "Review push", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm push", exact: true }).waitFor();
  assert.match(await dialog.innerText(), /refs\/heads\/published/);

  await dialog.getByRole("button", { name: "Confirm push", exact: true }).click();
  await dialog
    .getByRole("status")
    .filter({ hasText: /new branch/ })
    .waitFor();
  assert.equal(git(remote, "rev-parse", "published"), git(clientPath, "rev-parse", "main"));

  await chooseSelect(dialog.getByLabel("Push mode"), "delete");
  await dialog.getByLabel("HTTPS token").fill(token);
  await dialog.getByLabel("HTTPS username").fill("fixture");
  await dialog.getByRole("button", { name: "Review push", exact: true }).click();

  const confirmDelete = dialog.getByRole("button", { name: "Confirm deletion", exact: true });

  await confirmDelete.waitFor();
  assert.equal(await confirmDelete.isEnabled(), false);

  await dialog.getByLabel("Confirm remote ref").fill("refs/heads/published");
  await confirmDelete.click();
  await dialog
    .getByRole("status")
    .filter({ hasText: /deleted/ })
    .waitFor();
  assert.equal(git(remote, "branch", "--list", "published"), "");
  assert.equal(git(clientPath, "branch", "--show-current"), "main");

  git(clientPath, "tag", "-a", "release", "-m", "release notes");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Fetch", exact: true }).click();
  await fetchAuthentication.getByLabel("HTTPS username").fill("fixture");
  await fetchAuthentication.getByLabel("HTTPS token").fill(token);
  await fetchAuthentication.getByRole("button", { name: "Retry fetch", exact: true }).click();
  await fetchAuthentication.waitFor({ state: "hidden" });
  await page
    .getByRole("status")
    .filter({ hasText: /Fetched origin/ })
    .first()
    .waitFor();
  await page.getByRole("button", { name: "Remotes", exact: true }).click();
  await dialog.getByRole("tab", { name: "Push", exact: true }).click();
  await chooseSelect(dialog.getByLabel("Ref type"), "tag");
  await chooseSelect(dialog.getByLabel("Push mode"), "normal");
  await chooseSelect(dialog.getByLabel("Local tag"), "release");
  await dialog.getByText("HTTPS authentication", { exact: true }).click();
  await dialog.getByLabel("HTTPS username").fill("fixture");
  await dialog.getByLabel("HTTPS token").fill(token);
  await dialog.getByRole("button", { name: "Review push", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm push", exact: true }).click();
  await dialog
    .getByRole("status")
    .filter({ hasText: /new tag/ })
    .waitFor();
  assert.equal(
    git(remote, "rev-parse", "refs/tags/release"),
    git(clientPath, "rev-parse", "refs/tags/release"),
  );

  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await writeFile(join(clientPath, "commit-and-push.txt"), "committed locally first\n");

  const staged = await page.evaluate(
    (id) => window.eda.repository.stage({ repositoryId: id }),
    repository.id,
  );

  assert.equal(staged.ok, true);

  await page
    .getByRole("textbox", { name: "Commit title", exact: true })
    .fill("Commit and push acceptance");
  await page.getByRole("button", { name: "Commit and Push…", exact: true }).click();
  await dialog.getByText(/Local commit saved/).waitFor();
  await chooseSelect(dialog.getByLabel("Remote", { exact: true }), "origin");

  const committedHead = git(clientPath, "rev-parse", "HEAD");

  assert.equal(git(clientPath, "log", "-1", "--format=%s"), "Commit and push acceptance");

  await dialog.getByText("HTTPS authentication", { exact: true }).click();
  await dialog.getByLabel("HTTPS username").fill("fixture");
  await dialog.getByLabel("HTTPS token").fill(token);
  await dialog.getByRole("button", { name: "Review push", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm push", exact: true }).waitFor();
  git(remote, "config", "receive.denyNonFastForwards", "true");
  git(clientPath, "branch", "--set-upstream-to=origin/main", "main");
  await writeFile(join(source, "concurrent.txt"), "concurrent remote change\n");
  git(source, "add", ".");
  git(source, "commit", "-m", "concurrent update");
  git(source, "push", "origin", "main");
  await dialog.getByRole("button", { name: "Confirm push", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Could not complete the action", exact: true })
    .getByRole("alert")
    .waitFor();
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  assert.equal(git(clientPath, "rev-parse", "HEAD"), committedHead);
  assert.equal(git(clientPath, "status", "--porcelain"), "");

  await dialog
    .getByText("Use Pull in the toolbar to integrate upstream changes, then retry the push.")
    .waitFor();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  assert.equal(
    await page.getByRole("textbox", { name: "Commit title", exact: true }).inputValue(),
    "",
  );

  const tlsResult = await page.evaluate(
    async ({ id, url, token }) => {
      await window.eda.remotes.change(id, {
        kind: "url",
        name: "origin",
        url: url.replace("127.0.0.1", "localhost"),
        push: false,
      });

      const result = await window.eda.remotes.fetch({
        repositoryId: id,
        remote: "origin",
        prune: false,
        tags: false,
        credentials: { username: "fixture", password: token },
      });

      await window.eda.remotes.change(id, { kind: "url", name: "origin", url, push: false });

      return result;
    },
    { id: repository.id, url, token },
  );

  assert.equal(tlsResult.ok, false);
  assert.equal(tlsResult.error.kind, "network-failed");
  assert.match(tlsResult.error.message, /TLS certificate/);

  hold = true;
  await page.getByRole("button", { name: "Fetch", exact: true }).click();

  let requestTimeout;

  try {
    await Promise.race([
      requestHeld,
      new Promise((_, reject) => {
        requestTimeout = setTimeout(
          () => reject(new Error("Fetch never reached the remote")),
          10000,
        );
      }),
    ]);
  } finally {
    clearTimeout(requestTimeout);
  }

  await page.getByRole("button", { name: /^Activity/ }).click();
  const runningFetch = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: /running.*Fetch remotes/ }) });
  await runningFetch.locator("summary").click();
  await runningFetch.getByRole("button", { name: "Cancel operation", exact: true }).click();
  await page
    .getByRole("button", { name: "Fetch", exact: true })
    .filter({ has: page.locator(".ui-action-visible .lucide-x") })
    .click();
  await page
    .getByRole("dialog", { name: "Could not complete the action", exact: true })
    .getByRole("alert")
    .filter({ hasText: /cancelled/ })
    .waitFor();
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.getByRole("button", { name: /^Activity/ }).click();
  hold = false;

  const records = await page.evaluate(() => window.eda.operations.list());

  assert.equal(records.ok, true);
  assert.ok(records.value.some((record) => record.state === "interrupted"));
  assert.doesNotMatch(JSON.stringify(records), /eda-fixture-access-only|wrong-token/);

  const before = git(clientPath, "rev-parse", "HEAD");

  assert.equal(repository.path.replaceAll("\\", "/"), clientPath.replaceAll("\\", "/"));
  assert.equal(before, committedHead);

  git(clientPath, "branch", "--set-upstream-to=origin/main", "main");
  await page.getByRole("button", { name: "Pull strategies", exact: true }).click();
  await page.getByRole("menuitem", { name: "Fast-forward only", exact: true }).click();
  const authentication = page.getByRole("dialog", { name: "HTTPS authentication", exact: true });
  await authentication.getByLabel("HTTPS username").fill("fixture");
  await authentication.getByLabel("HTTPS token").fill(token);
  await authentication.getByRole("button", { name: "Retry pull", exact: true }).click();
  await page
    .getByRole("button", { name: "Pull", exact: true })
    .filter({ has: page.locator(".ui-action-visible .lucide-x") })
    .click();
  await page
    .getByRole("dialog", { name: "Could not complete the action", exact: true })
    .getByRole("alert")
    .filter({ hasText: /diverged/ })
    .waitFor();
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  assert.equal(git(clientPath, "rev-parse", "HEAD"), committedHead);

  await page.getByRole("button", { name: "Pull strategies", exact: true }).click();
  await page.getByRole("menuitem", { name: "Rebase local commits", exact: true }).click();
  await authentication.getByLabel("HTTPS username").fill("fixture");
  await authentication.getByLabel("HTTPS token").fill(token);
  await authentication.getByRole("button", { name: "Retry pull", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Pull completed." }).waitFor();
  assert.equal(git(clientPath, "rev-parse", "HEAD^"), git(source, "rev-parse", "HEAD"));
  assert.equal(git(clientPath, "status", "--porcelain"), "");

  const finalPush = await page.evaluate(
    async ({ id, token }) => {
      const preview = await window.eda.remotes.preparePush({
        repositoryId: id,
        remote: "origin",
        branch: "main",
        destination: "main",
        setUpstream: false,
        mode: "normal",
        credentials: { username: "fixture", password: token },
      });

      if (!preview.ok) return preview;

      return window.eda.remotes.push(id, preview.value.token, {
        username: "fixture",
        password: token,
      });
    },
    { id: repository.id, token },
  );

  assert.equal(finalPush.ok, true);
  assert.equal(git(remote, "rev-parse", "main"), git(clientPath, "rev-parse", "HEAD"));

  git(source, "branch", "scheduled-only");
  git(source, "push", "origin", "scheduled-only");
  git(clientPath, "remote", "add", "scheduled", remote);

  const beforeScheduled = git(clientPath, "rev-parse", "HEAD");

  await writeFile(join(clientPath, "scheduled-local.txt"), "preserve unsaved work\n");
  await page.getByRole("button", { name: "Fetch options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Fetch settings…", exact: true }).click();
  const fetchSettings = page.locator("#settings-repository-fetch");
  await chooseSelect(
    fetchSettings.getByRole("combobox", { name: "Background fetch interval" }),
    "1",
  );

  const fetchDeadline = Date.now() + 45_000;

  for (;;) {
    const state = await page.evaluate(
      (id) => window.eda.backgroundFetch.inspect(id),
      repository.id,
    );

    if (
      state.ok &&
      state.value.remotes.some(
        (remote) => remote.name === "scheduled" && remote.history?.lastSuccess,
      )
    )
      break;

    if (Date.now() > fetchDeadline)
      throw new Error(`Scheduled fetch did not complete: ${JSON.stringify(state)}`);

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  assert.equal(
    git(clientPath, "rev-parse", "refs/remotes/scheduled/scheduled-only"),
    git(source, "rev-parse", "scheduled-only"),
  );
  assert.equal(git(clientPath, "rev-parse", "HEAD"), beforeScheduled);
  assert.equal(
    await readFile(join(clientPath, "scheduled-local.txt"), "utf8"),
    "preserve unsaved work\n",
  );

  await chooseSelect(
    fetchSettings.getByRole("combobox", { name: "Background fetch interval" }),
    "0",
  );
  await page.waitForFunction(async (id) => {
    const state = await window.eda.backgroundFetch.inspect(id);
    return state.ok && state.value.intervalMinutes === 0;
  }, repository.id);
  await app.close();
  app = await electron.launch({
    args: ["dist/main/index.js", `--user-data-dir=${join(root, "user-data")}`],
    env,
  });

  const resumedPage = await app.firstWindow();

  resumedPage.setDefaultTimeout(20_000);
  resumedPage.on("pageerror", (error) => errors.push(error.message));
  await resumedPage.getByRole("button", { name: "Settings", exact: true }).waitFor();

  const savedFetch = await resumedPage.evaluate(
    async (id) => window.eda.backgroundFetch.inspect(id),
    repository.id,
  );

  assert.equal(savedFetch.ok, true);
  assert.equal(savedFetch.value.intervalMinutes, 0);
  assert.ok(
    savedFetch.value.remotes.find((remote) => remote.name === "scheduled")?.history?.lastSuccess,
  );
  assert.equal(errors.length, 0, errors.join("\n"));

  console.log(
    `Remotes gate passed: private HTTPS clone/fetch/push, credential rejection/redaction, tracking, tags/deletion, rejected-push recovery, reviewed pull, scheduled fetch preserving local work, timestamp persistence after restart and cancellation (${heldRequests} held requests).`,
  );
} catch (error) {
  if (app) {
    console.error(
      await app.windows()[0]?.evaluate(async () => {
        const result = await window.eda.operations.list();

        if (!result.ok)
          throw new Error("Expected a successful IPC result: " + JSON.stringify(result));

        return result.value.map((record) => ({
          kind: record.kind,
          state: record.state,
          message: record.message,
          output: record.output,
        }));
      }),
    );
    await mkdir("screenshots", { recursive: true });
    await app
      .windows()[0]
      ?.screenshot({ path: resolve("screenshots/remotes-gate-failure.png") })
      .catch(() => {});
  }

  throw error;
} finally {
  if (app) await app.close().catch(() => app?.process().kill());

  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  }

  for (const child of children) child.kill();

  assert.ok(resolve(root).startsWith(resolve(tmpdir(), "eda-remotes-gate-")));

  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
