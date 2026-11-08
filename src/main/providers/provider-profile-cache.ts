type Entry<T> = { value: T | null; expiresAt: number };
const TTL = 5 * 60_000;
const MAX_ENTRIES = 128;

export class ProviderProfileCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly pending = new Map<string, Promise<T | null>>();

  constructor(private readonly now = Date.now) {}

  peek(key: string): T | null {
    return this.entries.get(key)?.value ?? null;
  }

  set(key: string, value: T): void {
    this.save(key, value, TTL);
  }

  async get(
    key: string,
    load: () => Promise<T | null>,
    fallback: T | null = null,
  ): Promise<T | null> {
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > this.now()) return cached.value;
    const pending = this.pending.get(key);
    if (pending) return pending;
    if (this.pending.size >= MAX_ENTRIES) return cached?.value ?? fallback;
    const work = this.refresh(key, load, cached?.value ?? fallback).finally(() =>
      this.pending.delete(key),
    );
    this.pending.set(key, work);
    return work;
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  async clear(): Promise<void> {
    await Promise.allSettled(this.pending.values());
    this.entries.clear();
  }

  private async refresh(
    key: string,
    load: () => Promise<T | null>,
    fallback: T | null,
  ): Promise<T | null> {
    let value = fallback;
    let ttl = 60_000;
    try {
      const loaded = await load();
      if (loaded !== null) {
        value = loaded;
        ttl = TTL;
      }
    } catch {}
    this.save(key, value, ttl);
    return value;
  }

  private save(key: string, value: T | null, ttl: number): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttl });
    while (this.entries.size > MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value!);
  }
}
