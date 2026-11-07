import { preferredRemote, type RemoteTagSummary } from "@shared/integrations/remotes";
import type { TagSummary } from "@shared/repository/repository-write";
import { useEffect, useState } from "react";

export interface TagReference extends TagSummary {
  local: boolean;
  localOnly: boolean;
  remotes: { name: string; oid: string }[];
  unknownRemotes: string[];
}

export function useTagReferences(
  repositoryId: string,
  profileId: string | undefined,
  localTags: TagSummary[],
  revision: number,
  pending: boolean,
) {
  const [snapshot, setSnapshot] = useState<{
    repositoryId: string;
    profileId: string | undefined;
    remotes: { name: string; tags: RemoteTagSummary[] | null }[];
  } | null>(null);
  useEffect(() => {
    if (pending) return;
    let cancelled = false;
    void (async () => {
      const state = await window.eda.remotes.inspect(repositoryId);
      if (cancelled || !state.ok) return;
      const preferred = preferredRemote(state.value)?.name;
      const remotes = [...state.value.remotes].sort(
        (a, b) => Number(b.name === preferred) - Number(a.name === preferred),
      );
      setSnapshot({
        repositoryId,
        profileId,
        remotes: remotes.map((remote) => ({ name: remote.name, tags: null })),
      });
      await Promise.all(
        remotes.map(async (remote) => {
          const result = await window.eda.remotes
            .listTags({ repositoryId, remote: remote.name })
            .catch(() => null);
          if (cancelled) return;
          setSnapshot((old) => {
            const current =
              old?.repositoryId === repositoryId && old.profileId === profileId ? old.remotes : [];
            const tags = result?.ok ? result.value : null;
            return {
              repositoryId,
              profileId,
              remotes: remotes.map((item) =>
                item.name === remote.name
                  ? { name: item.name, tags }
                  : (current.find((saved) => saved.name === item.name) ?? {
                      name: item.name,
                      tags: null,
                    }),
              ),
            };
          });
        }),
      );
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [repositoryId, profileId, revision, pending]);

  const remoteStatusKnown =
    snapshot?.repositoryId === repositoryId && snapshot.profileId === profileId;
  const remotes = remoteStatusKnown ? snapshot.remotes : [];
  const unknownRemotes = remotes
    .filter((remote) => remote.tags === null)
    .map((remote) => remote.name);
  const merged = new Map<string, TagReference>(
    localTags.map((tag) => [
      tag.name,
      { ...tag, local: true, localOnly: false, remotes: [], unknownRemotes },
    ]),
  );
  for (const remote of remotes) {
    for (const tag of remote.tags ?? []) {
      let reference = merged.get(tag.name);
      if (!reference) {
        reference = { ...tag, local: false, localOnly: false, remotes: [], unknownRemotes };
        merged.set(tag.name, reference);
      }
      reference.remotes.push({ name: remote.name, oid: tag.oid });
    }
  }
  for (const tag of merged.values()) {
    tag.localOnly =
      tag.local && remoteStatusKnown && unknownRemotes.length === 0 && tag.remotes.length === 0;
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}
