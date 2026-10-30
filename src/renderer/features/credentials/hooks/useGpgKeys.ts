import { t } from "@shared/i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GpgSigningKey } from "@shared/identity/signing";

export function useGpgKeys(profileId: string, enabled: boolean) {
  const [keys, setKeys] = useState<GpgSigningKey[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async (): Promise<boolean> => {
    const request = ++generation.current;

    setLoading(true);
    setError(null);

    try {
      const result = await window.eda.identity.listGpgSigningKeys();

      if (request !== generation.current) return false;

      if (result.ok) {
        setKeys(result.value);
        return true;
      }

      setError([result.error.message, result.error.suggestedAction].filter(Boolean).join(" "));

      return false;
    } catch {
      if (request === generation.current)
        setError(t("credentials.useGpgKeys.couldNotDetectGpgSigningKeysTryRefreshingTheKeys"));
      return false;
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setKeys([]);
    if (enabled) void refresh();
    return () => {
      generation.current++;
    };
  }, [profileId, enabled, refresh]);

  return { keys, loading, error, refresh };
}
