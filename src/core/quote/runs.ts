/** Run records (ADR-0009): append-only JSONL per draft, kept on the user's machine. Same file layout as Python. */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isoNow } from "./model.ts";

export class RunRecord {
  readonly path: string;
  constructor(root: string, draftId: string) { this.path = join(root, "runs", `${draftId}.jsonl`); }

  async append(kind: string, data: Record<string, unknown> = {}): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, JSON.stringify({ ...data, t: isoNow(), kind }) + "\n", "utf8");
  }

  /** Times `work`, recording the step even when it throws. */
  async step<T>(name: string, work: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try { return await work(); }
    finally { await this.append("step", { name, ms: Math.round((performance.now() - start) * 1000) / 1000 }); }
  }

  async read(): Promise<Record<string, any>[]> {
    let text: string;
    try { text = await readFile(this.path, "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    return text.split("\n").filter(Boolean).map(line => JSON.parse(line) as Record<string, any>);
  }
}
