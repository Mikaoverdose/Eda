import type { GitHubAccountProfile } from "@shared/integrations/github";
import { isRecord } from "@shared/validation";

type PublicProfile = Omit<GitHubAccountProfile, "avatarDataUrl">;
type Account = { id?: string; login: string };
type Entry = { value: PublicProfile | null; expiresAt: number };

const LOGIN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const ID = /^[1-9][0-9]{0,15}$/;
const TTL = 5 * 60_000;
const MAX_ENTRIES = 128;

function field(value: unknown, limit: number): string | null {
  return typeof value === "string"
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .trim()
        .slice(0, limit) || null
    : null;
}

function profile(value: unknown): PublicProfile | null {
  if (!isRecord(value)) return null;

  const id = String(value["id"]);
  const login = value["login"];

  if (!ID.test(id) || typeof login !== "string" || !LOGIN.test(login)) return null;

  return {
    id,
    login,
    name: field(value["name"], 128),
    bio: field(value["bio"], 160),
    location: field(value["location"], 128),
  };
}

function matches(key: string, value: PublicProfile): boolean {
  return key.startsWith("login:") ? key === `login:${value.login.toLowerCase()}` : key === value.id;
}

export class GitHubProfileCache {
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Promise<PublicProfile | null>>();

  constructor(
    private readonly request: (url: string) => Promise<Record<string, unknown>>,
    private readonly now = Date.now,
  ) {}

  peek(id: string): PublicProfile | null {
    return this.entries.get(id)?.value ?? null;
  }

  async get(account: Account): Promise<PublicProfile | null> {
    if (!LOGIN.test(account.login) || (account.id !== undefined && !ID.test(account.id)))
      return null;

    const key = account.id ?? `login:${account.login.toLowerCase()}`;
    const cached = this.entries.get(key);

    if (cached && cached.expiresAt > this.now()) return cached.value;

    const pending = this.pending.get(key);

    if (pending) return pending;
    if (this.pending.size >= MAX_ENTRIES) return cached?.value ?? null;

    const work = this.refresh(key, account).finally(() => this.pending.delete(key));

    this.pending.set(key, work);

    return work;
  }

  async clear(): Promise<void> {
    await Promise.allSettled(this.pending.values());
    this.entries.clear();
  }

  private async refresh(key: string, account: Account): Promise<PublicProfile | null> {
    let value =
      this.entries.get(key)?.value ??
      (account.id
        ? {
            id: account.id,
            login: account.login,
            name: null,
            bio: null,
            location: null,
          }
        : null);
    let ttl = 60_000;

    try {
      const raw = await this.request(
        account.id
          ? `https://api.github.com/user/${account.id}`
          : `https://api.github.com/users/${account.login}`,
      );
      const details = profile(raw);

      if (
        typeof raw["id"] === "number" &&
        Number.isSafeInteger(raw["id"]) &&
        details &&
        matches(key, details)
      ) {
        value = details;
        ttl = TTL;
      }
    } catch {}

    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttl });

    while (this.entries.size > MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value!);

    return value;
  }
}
