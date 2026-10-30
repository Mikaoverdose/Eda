import { sep } from "node:path";
import type { Identity } from "@shared/identity/identity";

export function matchesGlob(path: string, pattern: string, home: string): boolean {
  const normalizedPath = normalize(expandHome(path, home));
  let normalizedPattern = normalize(expandHome(pattern, home));

  if (!normalizedPattern.includes("*") && !normalizedPattern.includes("?")) {
    return (
      normalizedPath === normalizedPattern || normalizedPath.startsWith(`${normalizedPattern}/`)
    );
  }

  if (normalizedPattern.endsWith("/*") && !normalizedPattern.endsWith("/**")) {
    normalizedPattern = `${normalizedPattern}*`;
  }

  return globToRegExp(normalizedPattern).test(normalizedPath);
}

export function findIdentityForPath(
  path: string,
  identities: readonly Identity[],
  home: string,
): Identity | undefined {
  let best: { identity: Identity; specificity: number } | undefined;

  for (const identity of identities) {
    for (const rule of identity.rules) {
      if (!matchesGlob(path, rule, home)) continue;
      const specificity = normalize(expandHome(rule, home)).replace(/\*/g, "").length;
      if (!best || specificity > best.specificity) {
        best = { identity, specificity };
      }
    }
  }

  return best?.identity;
}

function expandHome(value: string, home: string): string {
  if (value === "~") return home;
  if (value.startsWith("~/") || value.startsWith("~\\")) return home + sep + value.slice(2);
  return value;
}

function normalize(value: string): string {
  const forward = value.replace(/\\/g, "/");
  return forward.length > 1 ? forward.replace(/\/+$/, "") : forward;
}

function globToRegExp(pattern: string): RegExp {
  let regex = "";

  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i]!;

    if (char === "*") {
      if (pattern[i + 1] === "*") {
        const directories = (i === 0 || pattern[i - 1] === "/") && pattern[i + 2] === "/";

        // **/ also matches zero directories.
        regex += directories ? "(?:[^/]+/)*" : ".*";
        i += directories ? 2 : 1;
      } else {
        regex += "[^/]*";
      }

      continue;
    }

    if (char === "?") {
      regex += "[^/]";
      continue;
    }

    regex += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }

  return new RegExp(`^${regex}$`);
}
