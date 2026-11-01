import { ERROR_CODE } from "@shared/error-codes";
import { AppError } from "@shared/errors";
import type { CommitDecoration, HistoryCommit } from "@shared/repository/repository-read";

const FULL_OID = /^[0-9a-f]{40,64}$/;

export function parseLog(output: Buffer): HistoryCommit[] {
  if (output.length === 0) return [];
  return output
    .toString("utf8")
    .split("\x1e")
    .filter((record) => record.length > 0)
    .map(parseRecord);
}

function parseRecord(record: string): HistoryCommit {
  const fields = record.replace(/\n$/, "").split("\0");

  if (fields.at(-1) === "") fields.pop();
  if (fields.length !== 9) malformed();

  const [
    oid,
    parentField,
    authorName,
    authorEmail,
    authorTime,
    committerTime,
    subject,
    body,
    decorationField,
  ] = fields as [string, string, string, string, string, string, string, string, string];

  assertOid(oid);

  const parents = parentField === "" ? [] : parentField.split(" ");

  parents.forEach(assertOid);

  return {
    oid,
    parents,
    author: { name: authorName, email: authorEmail, timestamp: parseTimestamp(authorTime) },
    committerTimestamp: parseTimestamp(committerTime),
    subject,
    body,
    decorations: parseDecorations(decorationField),
  };
}

function parseDecorations(value: string): CommitDecoration[] {
  if (value === "") return [];

  return value.split("\x1f").map((raw) => {
    if (raw.startsWith("HEAD -> ")) {
      const target = raw.slice(8);
      return { type: "head", name: shortRef(target), target };
    }

    if (raw.startsWith("tag: refs/tags/")) return { type: "tag", name: raw.slice(15) };
    if (raw.startsWith("refs/heads/")) return { type: "local-branch", name: raw.slice(11) };
    if (raw.startsWith("refs/remotes/")) return { type: "remote-branch", name: raw.slice(13) };

    return { type: "ref", name: raw };
  });
}

function shortRef(ref: string): string {
  if (ref.startsWith("refs/heads/")) return ref.slice(11);
  if (ref.startsWith("refs/remotes/")) return ref.slice(13);
  return ref;
}

function parseTimestamp(value: string): string {
  if (!/^\d+$/.test(value)) malformed();
  const date = new Date(Number(value) * 1000);
  if (!Number.isFinite(date.getTime())) malformed();
  return date.toISOString();
}

function assertOid(value: string): void {
  if (!FULL_OID.test(value)) malformed();
}

function malformed(): never {
  throw new AppError(ERROR_CODE.INVALID_HISTORY_OUTPUT);
}
