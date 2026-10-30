import { useEffect, useState } from "react";
import type { AvatarImage } from "@shared/identity/avatar";

const requests = new Map<string, { expiresAt: number; result: Promise<AvatarImage> }>();

function request(email: string): Promise<AvatarImage> {
  const existing = requests.get(email);

  if (existing && existing.expiresAt > Date.now()) return existing.result;

  const entry = {
    expiresAt: Infinity,
    result: Promise.resolve<AvatarImage>({ dataUrl: null, expiresAt: 0 }),
  };

  entry.result = Promise.resolve()
    .then(async () => {
      try {
        const result = await window.eda.avatars.get(email);
        if (result.ok) return result.value;
      } catch {}

      return { dataUrl: null, expiresAt: Date.now() + 5 * 60_000 };
    })
    .then((image) => {
      entry.expiresAt = image.expiresAt;
      return image;
    });
  requests.delete(email);
  requests.set(email, entry);

  while (requests.size > 128) requests.delete(requests.keys().next().value!);

  return entry.result;
}

export function useAvatar(email?: string): string | undefined {
  const key = email?.trim().toLowerCase() ?? "";
  const [image, setImage] = useState<{ key: string; url: string | null } | null>(null);

  useEffect(() => {
    if (!key) return;

    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      const result = await request(key);
      if (!alive) return;
      setImage({ key, url: result.dataUrl });
      timer = setTimeout(() => void load(), Math.max(1000, result.expiresAt - Date.now()));
    };

    void load();

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [key]);

  return image?.key === key ? (image.url ?? undefined) : undefined;
}
