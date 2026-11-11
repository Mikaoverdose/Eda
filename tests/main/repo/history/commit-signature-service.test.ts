import { openInMemoryDatabase } from "@main/persistence/database";
import { IdentityRepository } from "@main/persistence/identity-repository";
import { RepositoryMemberships } from "@main/persistence/repository-memberships";
import { CommitSignatureRepository } from "@main/persistence/commit-signature-repository";
import { CommitSignatureService } from "@main/repo/history/commit-signature-service";
import type { Database } from "@main/persistence/types";
import {
  UNSIGNED_COMMIT_SIGNATURE,
  type CommitInspection,
  type CommitSignatureVerification,
} from "@shared/repository/repository-read";

const oid = "a".repeat(40);
const verified: CommitSignatureVerification = {
  status: "verified",
  format: "ssh",
  reasonCode: null,
  diagnostics: "Good signature",
};
const invalid: CommitSignatureVerification = {
  status: "invalid",
  format: "ssh",
  reasonCode: "bad-signature",
  diagnostics: "Bad signature",
};
let db: Database;

beforeEach(() => {
  db = openInMemoryDatabase();
});
afterEach(() => db.close());

function setup() {
  const profile = new IdentityRepository(db).create({
    name: "Work",
    gitName: "Work",
    gitEmail: "work@example.test",
    hue: 210,
    rules: [],
    signing: { format: "none", signCommits: false },
  });
  const memberships = new RepositoryMemberships(db);
  const repository = memberships.register("/repo", profile.id);
  const repositories = {
    resolveActiveRepository: (id: string) => {
      const row = memberships.find(id, profile.id);
      if (!row) throw new Error("Repository is not in this profile");
      return row;
    },
  };
  const git = {
    commitSignature: vi.fn(async () => verified),
    inspectCommit: vi.fn(
      async (
        _path: string,
        commitOid: string,
        signature = UNSIGNED_COMMIT_SIGNATURE,
      ): Promise<CommitInspection> => ({
        commit: {
          oid: commitOid,
          parents: [],
          author: { name: "Work", email: "work@example.test", timestamp: "2026-11-11" },
          committerTimestamp: "2026-11-11",
          subject: "Commit",
          body: "",
          decorations: [],
        },
        containingRefs: [],
        shallow: false,
        signed: signature.status !== "unsigned",
        signature,
      }),
    ),
  };
  const cache = new CommitSignatureRepository(db);
  const service = new CommitSignatureService(git, repositories, cache);
  return { service, git, cache, repository, memberships, repositories, profile };
}

it("shares verification work and reuses persisted results for history and details until explicitly rechecked", async () => {
  const { service, git, cache, repository, repositories } = setup();
  await Promise.all([service.read(repository.id, oid), service.read(repository.id, oid)]);
  expect(git.commitSignature).toHaveBeenCalledOnce();

  const restarted = new CommitSignatureService(git, repositories, cache);
  expect((await restarted.inspect(repository.id, oid)).signature).toEqual(verified);
  expect(git.commitSignature).toHaveBeenCalledOnce();
  git.commitSignature.mockResolvedValueOnce(invalid);
  expect((await restarted.inspect(repository.id, oid, true)).signature).toEqual(invalid);
  expect(await restarted.read(repository.id, oid)).toEqual(invalid);
  expect(git.commitSignature).toHaveBeenCalledTimes(2);
});

it.each(["background-first", "refresh-first"])(
  "returns the newer recheck to all readers (%s)",
  async (order) => {
    const { service, git, cache, repository, profile } = setup();
    const pending: Array<(signature: CommitSignatureVerification) => void> = [];
    git.commitSignature.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    const background = service.read(repository.id, oid);
    const refresh = service.read(repository.id, oid, true);

    if (order === "background-first") {
      pending[0]!(verified);
      await Promise.resolve();
    }

    pending[1]!(invalid);
    await refresh;
    if (order === "refresh-first") pending[0]!(verified);
    expect(await background).toEqual(invalid);
    expect(cache.read(profile.id, repository.id, oid)).toEqual(invalid);
    expect(await service.read(repository.id, oid)).toEqual(invalid);
  },
);

it("does not recreate cached data when a repository is removed during verification", async () => {
  const { service, git, cache, repository, profile, memberships } = setup();
  let finish!: (signature: CommitSignatureVerification) => void;
  git.commitSignature.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const request = service.read(repository.id, oid);
  memberships.remove(repository.id, profile.id);
  finish(verified);
  await expect(request).rejects.toThrow("Repository is not in this profile");

  expect(cache.read(profile.id, repository.id, oid)).toBeNull();
  await expect(service.read(repository.id, oid)).rejects.toThrow(
    "Repository is not in this profile",
  );
});

it("retries failed requests and validates object IDs before consulting the cache or Git", async () => {
  const { service, git, cache, repository, profile } = setup();
  await expect(service.read(repository.id, "--all")).rejects.toThrow();
  expect(git.commitSignature).not.toHaveBeenCalled();
  git.commitSignature.mockRejectedValueOnce(new Error("Commit unavailable"));
  await expect(service.read(repository.id, oid)).rejects.toThrow("Commit unavailable");
  expect(cache.read(profile.id, repository.id, oid)).toBeNull();
  expect(await service.read(repository.id, oid)).toEqual(verified);
});
