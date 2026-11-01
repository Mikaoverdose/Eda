import { errorText } from "@shared/error-codes";
import { GitError } from "@shared/errors";
import { t } from "@shared/i18n";
import type { RepositorySummary } from "@shared/repository/repository";
import { useEffect } from "react";
import { useAppStore } from "../../stores/app-store";
import { useRepositoryStore } from "../../stores/repository-store";

export async function showOpenedRepository(
  repository: RepositorySummary,
  owner: string,
): Promise<boolean> {
  if (useAppStore.getState().activeIdentity?.id !== owner) return false;

  await useAppStore.getState().refreshRepositories();

  if (useAppStore.getState().activeIdentity?.id !== owner) return false;

  useAppStore.getState().selectRepository(repository.id);
  await useRepositoryStore.getState().open(repository.id, owner, true);

  return (
    useAppStore.getState().activeIdentity?.id === owner &&
    useRepositoryStore.getState().repositoryId === repository.id
  );
}

export function useRepositoryNavigation(profileId: string | undefined, showWorkspace: () => void) {
  useEffect(() => {
    if (!profileId) return;

    let alive = true;
    let running = false;
    let again = false;
    const process = async () => {
      if (running) {
        again = true;
        return;
      }

      running = true;

      try {
        do {
          again = false;

          const result = await window.eda.app.takeNavigation();

          if (!alive || !result.ok) return;

          for (const target of result.value) {
            if (!alive || useAppStore.getState().activeIdentity?.id !== profileId) return;

            const opened = await window.eda.repository.open(target.path);

            if (!alive) return;

            if (!opened.ok) {
              useAppStore.setState({ error: opened.error });
              continue;
            }

            showWorkspace();

            if (!(await showOpenedRepository(opened.value, profileId))) return;

            let oid = target.commit;

            if (target.ref) {
              const [branches, tags] = await Promise.all([
                window.eda.repository.listBranches(opened.value.id),
                window.eda.repository.listTags(opened.value.id),
              ]);

              oid = branches.ok
                ? branches.value.find(
                    (branch) =>
                      branch.name === target.ref ||
                      `refs/${branch.remote ? "remotes" : "heads"}/${branch.name}` === target.ref,
                  )?.oid
                : undefined;
              oid ??= tags.ok
                ? tags.value.find(
                    (tag) => tag.name === target.ref || `refs/tags/${tag.name}` === target.ref,
                  )?.oid
                : undefined;

              if (!oid)
                useAppStore.setState({
                  error: new GitError({
                    kind: "invalid-input",
                    operation: t("operations.openRepositoryLink"),
                    message: errorText(
                      "useRepositoryNavigation.theRequestedReferenceWasNotFoundTheRepository",
                    ),
                  }).toData(),
                });
            }

            if (oid && alive && useAppStore.getState().activeIdentity?.id === profileId)
              await useRepositoryStore.getState().jumpToCommit(oid);
          }
        } while (again && alive);
      } finally {
        running = false;
      }
    };

    const unsubscribe = window.eda.events.onNavigation(() => void process());

    void process();

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [profileId, showWorkspace]);
}
