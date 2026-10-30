export function redactDiagnostic(value: string): string {
  return value
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g,
      "[redacted private key]",
    )
    .replace(/\b[a-z][a-z\d+.-]*:\/\/[^\s<>"']+/gi, (url) =>
      url.replace(/^(\w[\w+.-]*:\/\/)[^/]*@/, "$1[redacted]@").replace(/[?#].*$/, "?[redacted]"),
    )
    .replace(/\b(authorization\s*[:=]\s*)(?:basic|bearer)\s+[^\s,;]+/gi, "$1[redacted]")
    .replace(
      /\b((?:password|passwd|passphrase|(?:access[_-]?)?token|client[_-]?secret)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi,
      "$1[redacted]",
    )
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+)\b/g,
      "[redacted token]",
    );
}
