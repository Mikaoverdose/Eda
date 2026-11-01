import { expect, it } from "vitest";
import {
  preferredRemote,
  remoteForTrackingRef,
  type RemoteSummary,
} from "@shared/integrations/remotes";

const remote = (name: string): RemoteSummary => ({ name, fetchUrls: [], pushUrls: [] });

it("resolves overlapping remote names independently of their order", () => {
  const remotes = [remote("team"), remote("team/fork")];
  expect(remoteForTrackingRef(remotes, "team/fork/release")?.name).toBe("team/fork");
  expect(remoteForTrackingRef([...remotes].reverse(), "team/fork/release")?.name).toBe("team/fork");
  expect(remoteForTrackingRef(remotes, "team/main")?.name).toBe("team");
  expect(remoteForTrackingRef(remotes, "teammate/main")).toBeUndefined();
  expect(remoteForTrackingRef(remotes, undefined)).toBeUndefined();
});

it("prefers the checked-out local branch upstream, then origin, then the first remote", () => {
  const remotes = [remote("first"), remote("origin"), remote("team/fork")];
  expect(
    preferredRemote({
      remotes,
      branches: [
        {
          name: "main",
          remote: false,
          isHead: true,
          oid: "a".repeat(40),
          upstreamState: "",
          upstream: "team/fork/main",
        },
      ],
    })?.name,
  ).toBe("team/fork");
  expect(preferredRemote({ remotes, branches: [] })?.name).toBe("origin");
  expect(preferredRemote({ remotes: [remotes[0]!], branches: [] })?.name).toBe("first");
  expect(preferredRemote({ remotes: [], branches: [] })).toBeUndefined();
});
