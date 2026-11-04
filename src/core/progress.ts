/** Progress lines for a person at a terminal. Off unless the CLI turns it on, so MCP, pipes and `--json` stay silent. */

let sink: ((message: string) => void) | null = null;

export function setProgress(next: ((message: string) => void) | null): void {
  sink = next;
}

export function progress(message: string): void {
  if (!sink) return;
  try { sink(message); } catch { /* progress must never fail the work */ }
}
