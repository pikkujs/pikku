import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  ScenarioArtifact,
  ScenarioResult,
  ScenarioRunRecord,
  ScenarioRunStore,
  ScenarioRunSummary,
} from '../wirings/workflow/scenario-run.types.js'

/** The record, beside the images and footage the same run produced. */
const RECORD_FILE = 'run.json'

/**
 * A run id is a path segment, and `get('../../etc')` is a file read.
 *
 * Ids are generated here, so anything failing this arrived from outside and is
 * refused rather than sanitised — a request for a run that cannot exist is a
 * request for a run that does not exist.
 */
const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

/** Counts and duration, derived rather than stored so they cannot disagree. */
export const scenarioRunSummary = (
  record: ScenarioRunRecord
): ScenarioRunSummary => ({
  runId: record.runId,
  environment: record.environment,
  surface: record.surface,
  status: record.status,
  startedAt: record.startedAt,
  finishedAt: record.finishedAt,
  durationMs: record.finishedAt
    ? new Date(record.finishedAt).getTime() -
      new Date(record.startedAt).getTime()
    : undefined,
  passed: record.results.filter((r) => r.status === 'passed').length,
  failed: record.results.filter((r) => r.status === 'failed').length,
  skipped: record.skipped.length,
  artifacts: record.results.reduce(
    (total, result) => total + (result.artifacts?.length ?? 0),
    0
  ),
})

/**
 * What a scenario artifact is served as.
 *
 * A short, closed list rather than a MIME database: a run produces images and
 * recordings and nothing else, and anything unrecognised is served as bytes the
 * browser is told not to interpret.
 */
const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
}

export const scenarioArtifactContentType = (path: string): string =>
  CONTENT_TYPES[path.split('.').pop()?.toLowerCase() ?? ''] ??
  'application/octet-stream'

/**
 * An artifact path is a content key from the record, but it arrives from a
 * client and is joined onto a directory. Anything that could climb out of the
 * run, or name something other than a file inside it, is refused.
 */
const SAFE_ARTIFACT_PATH =
  /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/

export interface FileScenarioRunStoreOptions {
  /** The directory runs live under — one folder per run, named by its id. */
  dir: string
  /**
   * How many runs to keep. Older ones are deleted, with their artifacts, as a
   * new run opens.
   *
   * Bounded on purpose: a run with video is megabytes, and an unbounded history
   * beside a project is a directory nobody notices until it is enormous.
   */
  keep?: number
}

const DEFAULT_KEEP = 20

/**
 * Scenario run history as files on disk — the OSS store.
 *
 * One folder per run holding its record and everything it filed, which makes a
 * run a thing you can open, copy, attach to an issue or delete with `rm -rf`.
 * A hosted project swaps this for a table and an object store; the console
 * reads the same shapes from either.
 *
 * Writes are serialised through one chain. Scenarios finish one at a time, but
 * `recordScenario` is read-modify-write on a single file, and a store that
 * corrupts its own history the first time two things overlap is worse than no
 * history.
 */
export class FileScenarioRunStore implements ScenarioRunStore {
  private writes: Promise<unknown> = Promise.resolve()

  constructor(private readonly options: FileScenarioRunStoreOptions) {}

  async start(record: ScenarioRunRecord): Promise<void> {
    await this.serialise(async () => {
      await this.write(record)
      await this.prune(record.runId)
    })
  }

  async recordScenario(runId: string, result: ScenarioResult): Promise<void> {
    await this.serialise(async () => {
      const record = await this.read(runId)
      if (!record) {
        return
      }
      record.results.push(result)
      await this.write(record)
    })
  }

  async attachArtifacts(
    runId: string,
    artifacts: ScenarioArtifact[]
  ): Promise<void> {
    if (artifacts.length === 0) {
      return
    }
    await this.serialise(async () => {
      const record = await this.read(runId)
      if (!record) {
        return
      }
      for (const artifact of artifacts) {
        const result = record.results.find(
          (candidate) => candidate.name === artifact.scenario
        )
        // An artifact whose scenario is not in the results belongs to a
        // scenario that never produced one — it is dropped rather than filed
        // under a run-level bucket nothing renders.
        if (result) {
          result.artifacts = [...(result.artifacts ?? []), artifact]
        }
      }
      await this.write(record)
    })
  }

  async finish(
    runId: string,
    outcome: Pick<
      ScenarioRunRecord,
      'status' | 'finishedAt' | 'skipped' | 'hookFailures'
    >
  ): Promise<void> {
    await this.serialise(async () => {
      const record = await this.read(runId)
      if (!record) {
        return
      }
      await this.write({ ...record, ...outcome })
    })
  }

  async readArtifact(
    runId: string,
    path: string
  ): Promise<
    { body: Uint8Array<ArrayBuffer>; contentType: string } | undefined
  > {
    if (!SAFE_RUN_ID.test(runId) || !SAFE_ARTIFACT_PATH.test(path)) {
      return undefined
    }
    try {
      const file = await readFile(
        join(this.options.dir, runId, ...path.split('/'))
      )
      return {
        body: new Uint8Array(file),
        contentType: scenarioArtifactContentType(path),
      }
    } catch {
      return undefined
    }
  }

  async list(options: { limit?: number } = {}): Promise<ScenarioRunSummary[]> {
    const summaries: ScenarioRunSummary[] = []
    for (const runId of await this.runIds()) {
      const record = await this.read(runId)
      if (record) {
        summaries.push(scenarioRunSummary(record))
      }
    }
    summaries.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    return options.limit ? summaries.slice(0, options.limit) : summaries
  }

  async get(runId: string): Promise<ScenarioRunRecord | undefined> {
    return this.read(runId)
  }

  async remove(runId: string): Promise<void> {
    if (!SAFE_RUN_ID.test(runId)) {
      return
    }
    await rm(join(this.options.dir, runId), { recursive: true, force: true })
  }

  /** Where this run's artifacts live, for a driver writing into it. */
  runDir(runId: string): string {
    return join(this.options.dir, runId)
  }

  private serialise<T>(work: () => Promise<T>): Promise<T> {
    const next = this.writes.then(work, work)
    // Swallowed on the CHAIN only, so one failed write does not reject every
    // later one; the caller still sees its own rejection through `next`.
    this.writes = next.catch(() => {})
    return next
  }

  private async read(runId: string): Promise<ScenarioRunRecord | undefined> {
    if (!SAFE_RUN_ID.test(runId)) {
      return undefined
    }
    try {
      const raw = await readFile(
        join(this.options.dir, runId, RECORD_FILE),
        'utf-8'
      )
      return JSON.parse(raw) as ScenarioRunRecord
    } catch {
      // A folder with artifacts but no readable record is a run that was killed
      // mid-write. It is not listable, and it is not an error either.
      return undefined
    }
  }

  private async write(record: ScenarioRunRecord): Promise<void> {
    const dir = join(this.options.dir, record.runId)
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, RECORD_FILE),
      JSON.stringify(record, null, 2) + '\n'
    )
  }

  private async runIds(): Promise<string[]> {
    try {
      const entries = await readdir(this.options.dir, { withFileTypes: true })
      return entries
        .filter((entry) => entry.isDirectory() && SAFE_RUN_ID.test(entry.name))
        .map((entry) => entry.name)
    } catch {
      return []
    }
  }

  /**
   * Drop the oldest runs past the limit, never the one just opened — a `keep`
   * of zero or one must still leave the run being started.
   */
  private async prune(keeping: string): Promise<void> {
    const keep = this.options.keep ?? DEFAULT_KEEP
    const dated: Array<{ runId: string; startedAt: string }> = []
    for (const runId of await this.runIds()) {
      if (runId === keeping) {
        continue
      }
      const record = await this.read(runId)
      dated.push({ runId, startedAt: record?.startedAt ?? '' })
    }
    dated.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    for (const { runId } of dated.slice(Math.max(keep - 1, 0))) {
      await rm(join(this.options.dir, runId), { recursive: true, force: true })
    }
  }
}
