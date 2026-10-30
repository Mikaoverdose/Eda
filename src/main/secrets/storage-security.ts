export function isSecureStorageBackend(platform: NodeJS.Platform, backend: string): boolean {
  return platform !== "linux" || backend !== "basic_text";
}
