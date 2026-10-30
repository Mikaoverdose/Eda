import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { err, ok, type Result } from "@shared/errors";
import type { Identity } from "@shared/identity/identity";
import type { GpgSigningKey } from "@shared/identity/signing";
import { SigningSettings } from "@renderer/features/credentials/SigningSettings";

const identity: Identity = {
  id: "work",
  name: "Work",
  gitName: "Author",
  gitEmail: "work@example.com",
  signing: { format: "gpg", signCommits: true },
  hue: 210,
  rules: [],
  createdAt: "now",
  updatedAt: "now",
};

const key: GpgSigningKey = {
  fingerprint: "ECAF7590EB3443B5C7CF3ACB6C7EE1B8621CC013",
  keyId: "6C7EE1B8621CC013",
  userIds: ["Author <work@example.com>"],
  signingFingerprints: ["ECAF7590EB3443B5C7CF3ACB6C7EE1B8621CC013"],
  expiresAt: null,
};

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const button = () =>
  [...document.querySelectorAll("button")].find((item) => item.textContent === "Retry saving")!;
const picker = () => container.querySelectorAll('[role="combobox"]')[1]!;

it("keeps the selected key after a failed save and only persists an explicit choice for its profile", async () => {
  const configureSigning = vi.fn().mockResolvedValue(
    err({
      kind: "config-write-refused",
      operation: "configure signing",
      message: "Could not update Git configuration.",
    }),
  );

  vi.stubGlobal("eda", {
    identity: { listGpgSigningKeys: async () => ok([key]), configureSigning },
  });

  const onSaved = vi.fn(async () => {});

  await act(async () =>
    root.render(<SigningSettings identity={identity} sshKeys={[]} onSaved={onSaved} />),
  );
  expect(configureSigning).not.toHaveBeenCalled();
  expect(button()).toBeUndefined();

  await act(async () => {
    const manualKey = container.querySelector<HTMLInputElement>("input:not([type])")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      manualKey,
      key.fingerprint,
    );
    manualKey.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    container
      .querySelector<HTMLInputElement>("input:not([type])")!
      .dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
  );
  expect(configureSigning).toHaveBeenCalledWith(
    { format: "gpg", keyRef: key.fingerprint, signCommits: true },
    identity.id,
  );
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Could not update Git configuration",
  );
  expect(container.textContent).toContain(`Fingerprint: ${key.fingerprint}`);
  expect(onSaved).not.toHaveBeenCalled();

  configureSigning.mockResolvedValue(ok(identity));
  await act(async () => button().click());
  expect(onSaved).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(button()).toBeUndefined();
});

it("discards a late key query after switching profiles and preserves an undetected saved key", async () => {
  let finish!: (result: Result<GpgSigningKey[]>) => void;
  const pending = new Promise<Result<GpgSigningKey[]>>((resolve) => {
    finish = resolve;
  });
  const listGpgSigningKeys = vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce(ok([]));

  vi.stubGlobal("eda", { identity: { listGpgSigningKeys } });

  const onSaved = async () => {};

  await act(async () =>
    root.render(
      <SigningSettings key={identity.id} identity={identity} sshKeys={[]} onSaved={onSaved} />,
    ),
  );

  const home = { ...identity, id: "home", signing: { ...identity.signing, keyRef: "ABCDEF12" } };

  await act(async () =>
    root.render(<SigningSettings key={home.id} identity={home} sshKeys={[]} onSaved={onSaved} />),
  );
  await act(async () => finish(ok([key])));
  expect(picker().textContent).toContain("ABCDEF12");
  expect(picker().textContent).not.toContain(key.keyId);
  expect(container.textContent).toContain("No usable GPG signing keys found");
  expect(container.textContent).toContain("Your saved key is retained");
});
