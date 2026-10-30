export function referenceLabel(name: string): { name: string; path: string } {
  const separator = name.lastIndexOf("/");
  return separator < 0
    ? { name, path: "" }
    : { name: name.slice(separator + 1), path: name.slice(0, separator) };
}
