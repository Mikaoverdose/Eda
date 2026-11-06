import { useEffect, useState } from "react";

export function useNoticeDismissal(noticeId: string | null) {
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  useEffect(() => {
    setDismissedId(null);
  }, [noticeId]);

  return {
    dismissed: noticeId !== null && dismissedId === noticeId,
    dismiss: () => setDismissedId(noticeId),
  };
}
