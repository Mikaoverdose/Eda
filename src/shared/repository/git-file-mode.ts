export const GIT_FILE_MODE = {
  regular: "100644",
  executable: "100755",
  symlink: "120000",
  submodule: "160000",
} as const;

export function isRegularFileMode(mode: string): boolean {
  return mode === GIT_FILE_MODE.regular || mode === GIT_FILE_MODE.executable;
}
