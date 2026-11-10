import { _electron } from "playwright";

export const electron = {
  launch(options: Parameters<typeof _electron.launch>[0]) {
    return _electron.launch({
      ...options,
      args: [
        ...(options?.args ?? []),
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE [::1]",
      ],
    });
  },
};
