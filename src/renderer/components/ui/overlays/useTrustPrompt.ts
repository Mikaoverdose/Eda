import { useEffect, useRef, useState } from "react";
import { errorMessage, type Result } from "@shared/errors";

export function useTrustPrompt<Request extends { id: string }>(
  load: () => Promise<Result<Request | null>>,
  subscribe: (handler: (request: Request | null) => void) => () => void,
  send: (id: string, trust: boolean) => Promise<Result<void>>,
  failureMessage: string,
) {
  const [request, setRequest] = useState<Request | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const sending = useRef<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let revision = 0;
    const unsubscribe = subscribe((next) => {
      revision++;
      setRequest(next);
    });
    const initialRevision = revision;
    void load()
      .then((result) => {
        if (!disposed && revision === initialRevision && result.ok) setRequest(result.value);
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [load, subscribe]);

  const busy = request !== null && submitting === request.id;
  const respond = async (trust: boolean) => {
    if (!request || sending.current === request.id) return;
    sending.current = request.id;
    setSubmitting(request.id);
    setFeedback(null);
    try {
      const result = await send(request.id, trust);
      if (result.ok) setRequest((current) => (current?.id === request.id ? null : current));
      else setFeedback({ id: request.id, message: errorMessage(result.error) });
    } catch {
      setFeedback({
        id: request.id,
        message: failureMessage,
      });
    } finally {
      if (sending.current === request.id) sending.current = null;
      setSubmitting((current) => (current === request.id ? null : current));
    }
  };

  return {
    request,
    busy,
    respond,
    feedback: feedback?.id === request?.id ? feedback?.message : null,
  };
}
