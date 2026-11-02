/** Draft store: one JSON file per draft under the user data directory, written atomically (same layout as Python, D4). */
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { CalculatorError } from "../errors.ts";
import { Draft, invalid } from "./model.ts";
import { RunRecord } from "./runs.ts";

const ID = /^d-[0-9a-f]{8}$/;
const LOCK_WAIT_MS = 30_000;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const exists = (path: string) => stat(path).then(() => true, () => false);

export const dataDir = (env: Record<string, string | undefined> = process.env) => env.AUTOCALC_DATA ?? join(homedir(), ".local", "share", "autocalc");

export class DraftStore {
  readonly root: string;
  readonly dir: string;
  constructor(root?: string) { this.root = root ?? dataDir(); this.dir = join(this.root, "drafts"); }

  static newId(): string { return `d-${randomBytes(4).toString("hex")}`; }

  private path(draftId: string): string {
    if (typeof draftId !== "string" || !ID.test(draftId)) throw invalid(`No draft '${draftId}'.`, "draft_id");
    return join(this.dir, `${draftId}.json`);
  }

  /**
   * Hold an exclusive lock for `key` while `work` runs. A lock directory with the owner's pid, reaped when
   * that process is gone. shortcut: excludes TypeScript from TypeScript only, not Python's flock; the two
   * implementations are not meant to write one store at the same time (ADR-0017 cutover removes Python).
   */
  async withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    await mkdir(this.dir, { recursive: true });
    const lock = join(this.dir, `${key}.lockdir`), deadline = Date.now() + LOCK_WAIT_MS;
    for (;;) {
      try { await mkdir(lock); await writeFile(join(lock, "pid"), String(process.pid)); break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (await this.ownerGone(lock)) { await rm(lock, { recursive: true, force: true }); continue; }
        if (Date.now() > deadline) throw new CalculatorError("PROFILE_BUSY", `Another process holds the lock for ${key}.`, "Wait for it to finish, then retry.");
        await sleep(25);
      }
    }
    try { return await work(); } finally { await rm(lock, { recursive: true, force: true }); }
  }

  private async ownerGone(lock: string): Promise<boolean> {
    let pid: number;
    try { pid = Number(await readFile(join(lock, "pid"), "utf8")); } catch { return false; } // owner still writing its pid
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try { process.kill(pid, 0); return false; } catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH"; }
  }

  lock<T>(draftId: string, work: () => Promise<T>): Promise<T> {
    this.path(draftId); // validate before deriving a lock path
    return this.withLock(draftId, work);
  }

  private async writeAtomic(path: string, value: unknown): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const tmp = join(this.dir, `${randomBytes(6).toString("hex")}.tmp`);
    await writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
    await rename(tmp, path);
  }

  save(draft: Draft): Promise<void> { return this.writeAtomic(this.path(draft.id), draft.toJSON()); }

  async load(draftId: string): Promise<Draft> {
    const path = this.path(draftId);
    if (!(await exists(path))) throw invalid(`No draft '${draftId}'.`, "draft_id", undefined, "Create a draft with draft_quote, or check the draft id.");
    return Draft.fromJSON(JSON.parse(await readFile(path, "utf8")) as Record<string, any>);
  }

  private get index(): string { return join(this.dir, "published.json"); }
  private async readIndex(): Promise<Record<string, string>> { return (await exists(this.index)) ? JSON.parse(await readFile(this.index, "utf8")) as Record<string, string> : {}; }

  /** Remember which draft produced a saved list. */
  link(listId: string, draftId: string): Promise<void> {
    return this.withLock("published", async () => this.writeAtomic(this.index, { ...(await this.readIndex()), [listId]: draftId }));
  }

  async draftFor(listId: string): Promise<string | null> { return (await this.readIndex())[listId] ?? null; }

  inspect(draftId: string) {
    return this.lock(draftId, async () => {
      const draft = await this.load(draftId);
      const state = draft.publication ? "published" : draft.publishing ? "unknown_outcome" : draft.pending().length === 0 ? "ready" : "pending";
      return { draft_id: draft.id, state, pending: draft.pending(), publication: draft.publication };
    });
  }

  /** Clear an ambiguous local attempt only after an explicit external reconciliation. */
  async recover(draftId: string, confirmedNoRemoteList: boolean, justification: string) {
    if (confirmedNoRemoteList !== true) throw invalid("Check your saved lists and explicitly confirm that the attempted publication created no list.", "confirmed_no_remote_list");
    if (typeof justification !== "string" || !justification.trim()) throw invalid("Recovery needs a reconciliation justification.", "justification");
    return this.lock(draftId, async () => {
      const draft = await this.load(draftId);
      if (draft.publication || !draft.publishing) throw invalid("Only a publication with an unknown outcome can be reset.", "draft_id");
      await new RunRecord(this.root, draft.id).append("publication_recovery", { justification });
      draft.publishing = false;
      await this.save(draft);
      return { draft_id: draftId, state: "ready" };
    });
  }

  /** Newest first. */
  async list() {
    if (!(await exists(this.dir))) return [];
    const names = (await readdir(this.dir)).filter(n => /^d-.*\.json$/.test(n));
    const files = await Promise.all(names.map(async name => ({ name, mtime: (await stat(join(this.dir, name))).mtimeMs })));
    files.sort((a, b) => b.mtime - a.mtime);
    return Promise.all(files.map(async ({ name }) => {
      const d = JSON.parse(await readFile(join(this.dir, name), "utf8")) as Record<string, any>;
      return { id: d.id, customer: d.customer, created: d.created, state: d.publication ? "published" : d.publishing ? "unknown_outcome" : "draft" };
    }));
  }
}
