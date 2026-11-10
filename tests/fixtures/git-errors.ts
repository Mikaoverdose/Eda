/** Captured with Git 2.55.0 under LC_ALL=C on Linux; only paths were rewritten to /repo. */

export const GIT_FIXTURE_VERSION = "2.55.0";

export const gitErrorFixtures = {
  notARepositoryMissingDir: `fatal: cannot change to '/repo': No such file or directory`,

  notARepositoryPlainDir: `fatal: not a git repository (or any parent up to mount point /)
Stopping at filesystem boundary (GIT_DISCOVERY_ACROSS_FILESYSTEM not set).`,

  noUpstream: `fatal: No configured push destination.
Either specify the URL from the command-line or configure a remote repository using

    git remote add <name> <url>

and then push using the remote name

    git push <name>`,

  networkUnresolvedHost: `fatal: unable to access 'https://no-such-host.invalid/repo.git/': Could not resolve host: no-such-host.invalid`,

  badObject: `fatal: bad object deadbeefdeadbeefdeadbeefdeadbeefdeadbeef`,

  dirtyWorkingTree: `error: Your local changes to the following files would be overwritten by checkout:
	f.txt
Please commit your changes or stash them before you switch branches.
Aborting`,

  lockContention: `fatal: Unable to create '/repo/.git/index.lock': File exists.

Another git process seems to be running in this repository, or the lock file may be stale`,

  nonFastForward: `To /repo/origin.git
 ! [rejected]        main -> main (fetch first)
error: failed to push some refs to '/repo/origin.git'
hint: Updates were rejected because the remote contains work that you do not
hint: have locally. This is usually caused by another repository pushing to
hint: the same ref. If you want to integrate the remote changes, use
hint: 'git pull' before pushing again.
hint: See the 'Note about fast-forwards' in 'git push --help' for details.`,

  mergeConflict: `Auto-merging f.txt
CONFLICT (content): Merge conflict in f.txt
Automatic merge failed; fix conflicts and then commit the result.`,

  authPublickeyDenied: `git@github.com: Permission denied (publickey).
fatal: Could not read from remote repository.

Please make sure you have the correct access rights
and the repository exists.`,

  authHostKeyUnverified: `Host key verification failed.
fatal: Could not read from remote repository.`,
} as const;

// Representative push failures with --porcelain status records on stdout.
const pushFailed = "error: failed to push some refs to 'https://example.com/repo.git'";

export const pushErrorFixtures = {
  protectedBranch: {
    stderr: `remote: error: GH006: Protected branch update failed for refs/heads/main.\n${pushFailed}`,
    stdout:
      "!\trefs/heads/main:refs/heads/main\t[remote rejected] (protected branch hook declined)",
  },
  hookRejected: {
    stderr: pushFailed,
    stdout: "!\trefs/heads/main:refs/heads/main\t[remote rejected] (pre-receive hook declined)",
  },
  policyMentionsHistory: {
    stderr: `remote: Push access denied: non-fast-forward updates are not allowed by server policy.\n${pushFailed}`,
    stdout: "!\trefs/heads/main:refs/heads/main\t[remote rejected] (hook declined)",
  },
  generic: { stderr: pushFailed, stdout: "" },
  nonFastForward: {
    stderr: pushFailed,
    stdout: "!\trefs/heads/main:refs/heads/main\t[rejected] (non-fast-forward)",
  },
  fetchFirst: {
    stderr: pushFailed,
    stdout: "!\trefs/heads/main:refs/heads/main\t[rejected] (fetch first)",
  },
  staleLease: {
    stderr: pushFailed,
    stdout: "!\trefs/heads/main:refs/heads/main\t[rejected] (stale info)",
  },
  permissionDenied: {
    stderr: `remote: Write access to repository not granted.\n${pushFailed}`,
    stdout: "",
  },
} as const;
