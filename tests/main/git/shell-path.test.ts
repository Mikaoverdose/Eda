import { execFile } from "node:child_process";
import { restoreShellPath } from "@main/git/execution/shell-path";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

beforeEach(() => vi.resetAllMocks());

it("loads arbitrary tool directories from the login shell despite startup output", async () => {
  vi.mocked(execFile).mockImplementation(((
    _shell: string,
    args: string[],
    _options: unknown,
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ) => {
    const marker = (args as string[])[1]!.match(/EDA_PATH_[\w-]+/)![0];
    callback(
      null,
      `startup noise\n${marker}\n/custom/tools:/usr/bin:.:relative\n${marker}\nmore noise`,
      "",
    );
  }) as unknown as typeof execFile);
  const env = { SHELL: "/bin/zsh", PATH: "/usr/bin", PRIVATE_TOKEN: "retained" };
  await restoreShellPath(env, "darwin");
  expect(env.PATH).toBe("/custom/tools:/usr/bin");
  expect(env.PRIVATE_TOKEN).toBe("retained");
  expect(execFile).toHaveBeenCalledWith(
    "/bin/zsh",
    ["-ilc", expect.any(String)],
    expect.objectContaining({ timeout: 5000 }),
    expect.any(Function),
  );
});

it("also loads the login shell PATH on Linux", async () => {
  vi.mocked(execFile).mockImplementation(((
    _shell: string,
    args: string[],
    _options: unknown,
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ) => {
    const marker = (args as string[])[1]!.match(/EDA_PATH_[\w-]+/)![0];
    callback(null, `${marker}\n/other/tools:/bin\n${marker}\n`, "");
  }) as unknown as typeof execFile);
  const env = { SHELL: "/bin/bash", PATH: "/bin" };
  await restoreShellPath(env, "linux");
  expect(env.PATH).toBe("/other/tools:/bin");
});

it("preserves the inherited Windows PATH without launching a shell", async () => {
  const env = { PATH: "C:\\Tools;C:\\Windows\\System32" };
  await restoreShellPath(env, "win32");
  expect(env.PATH).toBe("C:\\Tools;C:\\Windows\\System32");
  expect(execFile).not.toHaveBeenCalled();
});

it("keeps the inherited PATH when the shell fails or times out", async () => {
  vi.mocked(execFile).mockImplementation(((
    _shell: string,
    _args: string[],
    _options: unknown,
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ) => {
    callback(new Error("timeout"), "", "");
  }) as unknown as typeof execFile);
  const env = { SHELL: "/bin/zsh", PATH: "/bin" };
  await restoreShellPath(env, "darwin");
  expect(env.PATH).toBe("/bin");
});

it.each(["noise only", "", ".:relative", "/bin\nunexpected"])(
  "ignores unusable shell output: %s",
  async (value) => {
    vi.mocked(execFile).mockImplementation(((
      _shell: string,
      args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      const marker = (args as string[])[1]!.match(/EDA_PATH_[\w-]+/)![0];
      callback(null, `${marker}\n${value}\n${marker}\n`, "");
    }) as unknown as typeof execFile);
    const env = { SHELL: "/bin/zsh", PATH: "/original" };
    await restoreShellPath(env, "darwin");
    expect(env.PATH).toBe("/original");
  },
);
