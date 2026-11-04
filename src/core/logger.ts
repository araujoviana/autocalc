/** Redact common credential-bearing headers and key/value pairs before diagnostics. */
export function redact(message: string): string {
  return message
    .replace(/\b(?:set-cookie|cookie|authorization)\s*:\s*[^\r\n]*/gi, "[redacted header]")
    .replace(/"(?:csrf|token|access_token|refresh_token|password|cookie|authorization)"\s*:\s*"(?:\\.|[^"\\])*"/gi, '"[redacted]":"[redacted]"')
    .replace(/\b(?:csrf|token|access_token|refresh_token|password)\s*[:=]\s*[^\s,;]+/gi, "[redacted credential]");
}
export function logError(message: string): void { console.error(redact(message)); }
