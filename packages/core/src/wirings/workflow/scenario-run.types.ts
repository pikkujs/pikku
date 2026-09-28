/**
 * What one `pikku scenario run` leaves behind.
 *
 * A run is history: the scenarios it selected, the sentences they were made of,
 * and the images and footage they produced. The sentences are snapshotted into
 * the record rather than looked up later, because a scenario is code and the
 * code moves — a run from last week describes a suite that no longer exists,
 * and re-deriving its ladder from today's source would quietly rewrite it.
 *
 * Everything here is plain serialisable data. That is what lets one record be
 * a JSON file on disk in OSS and a row in Postgres on a hosted project, read
 * back by the same console screen either way.
 */
import type { ScenarioBrowserFailure } from './scenario-step.types.js'

/** What a run filed, in the order it filed it. */
export type ScenarioArtifactKind = 'screenshot' | 'failure' | 'video'

/**
 * One image or recording a scenario produced.
 *
 * `path` is relative to the run's artifact root and always uses forward
 * slashes: it is a content key, not a filesystem path. Locally it resolves
 * under the run's directory; on a hosted project it is the object key in a
 * bucket, and the same record works unchanged.
 */
export interface ScenarioArtifact {
  /** The scenario label this belongs to, as the report names it. */
  scenario: string
  kind: ScenarioArtifactKind
  path: string
  /** Whose window it was — a two-actor scenario produces two of everything. */
  actor?: string
  /** The caption the scenario author took a screenshot under. */
  name?: string
  /**
   * The same shot across runs, under one key. `path` carries the order the run
   * happened in, so it moves whenever a step is inserted before it — nothing
   * that outlives a run (a caption override, a diff against last week) can key
   * off it.
   */
  id?: string
  /** Fit to show outside the run: a marketing card, a docs page, a gallery. */
  showcase?: boolean
}

/**
 * Where a step falls inside one actor's recording.
 *
 * Measured from the moment that actor's browser context opened — which is when
 * Playwright starts the file — rather than from the start of the scenario, so
 * it addresses the video's own clock. The two differ by however long the
 * scenario spent before that window existed, plus every non-browser step since,
 * which is why the offset is recorded at the moment the step runs instead of
 * being summed back out of the ladder afterwards.
 */
export interface ScenarioStepVideoOffset {
  /** Whose recording this offset is into: one actor, one video file. */
  actor: string
  offsetMs: number
}

/** One step of a run, already joined to the prose that declared it. */
export interface ScenarioStepRow {
  sentence: string
  /**
   * The same sentence with the actor's role in it — "yasser (the founder)
   * signs in". Set only on the step that first names each actor, and only
   * when a persona declares a job title or a role, so a reader who wants the
   * context picks this and one who wants the bare run picks `sentence`.
   */
  sentenceWithRole?: string
  status: string
  durationMs?: number
  error?: string
  /**
   * Where this step lands in each actor's video, for the actors whose window
   * was being recorded when it ran. Absent for a step with no actor, a run
   * without video, and a step that never ran at all.
   *
   * A list rather than one number because a video belongs to an actor, not to
   * the scenario: a step touching two windows falls at a different moment in
   * each, and an offset that does not name its file cannot be seeked to.
   */
  video?: ScenarioStepVideoOffset[]
}

/** Everything known about why one scenario failed. */
export interface ScenarioFailureDetail {
  /** The rendered sentence of the failing step; absent if no step failed. */
  sentence?: string
  message: string
  stack?: string
  /**
   * True when the failure was a deliberate one (a PikkuError). Its message is
   * the whole story, so the stack is noise.
   */
  expected?: boolean
  browser?: ScenarioBrowserFailure[]
}

export interface ScenarioResult {
  name: string
  /**
   * `running` is filed the moment the scenario starts and replaced when it
   * ends, so a console watching a run in progress can tell the scenario on
   * screen right now from the ones still waiting their turn.
   */
  status: 'passed' | 'failed' | 'running'
  durationMs: number
  output?: unknown
  error?: string
  steps?: ScenarioStepRow[]
  failure?: ScenarioFailureDetail
  /**
   * The registered scenario this ran, by the id it is registered under — the
   * same id `FeatureMetaEntry.scenario` references. The label alone does not
   * give it, and unlike the label it is not rewritten when the prose is.
   */
  scenarioName?: string
  /** The feature that grouped it — its display name, which is freely renamed. */
  feature?: string
  /**
   * The registered feature that grouped it, by id.
   *
   * `feature` is a title someone writes for people to read, so nothing that
   * outlives a run can key off it. This is what `addFeature` registered the
   * feature under, and it is what survives the title being rewritten.
   */
  featureId?: string
  /** The scenario's declared title, snapshotted so the record reads as prose. */
  title?: string
  description?: string
  /** Who the scenario cast, in declaration order. */
  actors?: string[]
  tags?: string[]
  /** Images and footage this scenario produced, filed under the run. */
  artifacts?: ScenarioArtifact[]
}

/** One scenario that was not run, and why. */
export interface ScenarioSkip {
  name: string
  reason: string
}

export interface ScenarioRunReport {
  environment: string
  results: ScenarioResult[]
  /**
   * Scenarios not run at all, each carrying why. A skip is only useful if the
   * reader can tell a browser scenario held back by `--no-browser` from one the
   * project itself quarantined, so the reason travels with the name rather than
   * being assumed by the formatter.
   */
  skipped: ScenarioSkip[]
  /** Feature-level hook failures, which belong to no single scenario. */
  hookFailures: string[]
}

export type ScenarioRunStatus = 'running' | 'passed' | 'failed'

/**
 * The filters a run was selected with, recorded when it was narrowed at all.
 *
 * A narrowed run is a partial record of the suite: scenarios a feature owns can
 * be missing from it, and whole features can be absent, with nothing in the
 * results to say so. Anything that reads a run as evidence of what the suite
 * does — rather than of what happened that afternoon — has to be able to tell
 * the two apart, and it cannot be inferred from the results afterwards.
 */
export interface ScenarioRunSelection {
  flows?: string[]
  features?: string[]
  tags?: string[]
  excludeTags?: string[]
}

/**
 * Which version of the suite a run ran against.
 *
 * A run is only comparable to another run of the same thing, and "the same
 * thing" is the commit — two runs a day apart are not a flake and a fix if the
 * suite moved between them. `attempt` counts the runs already filed against
 * that commit, so a suite re-run until it passes reads as one version with
 * several attempts rather than several unrelated runs.
 *
 * Absent when the project is not in a git repository, or has no commits yet:
 * an unversioned run is still a run, and saying nothing is better than
 * inventing a version for it.
 */
export interface ScenarioRunVersion {
  /** The commit the working tree was at, in full. */
  commit: string
  /**
   * The tree had uncommitted changes, so the commit does not describe what
   * actually ran. Recorded rather than refused — running against a dirty tree
   * is the normal way to work — but a reader comparing two attempts of the
   * same commit needs to know one of them was not really that commit.
   */
  dirty?: boolean
  /** Which run this is against that commit, counting from one. */
  attempt: number
}

/**
 * A whole run, as it is stored and read back.
 *
 * `status` is `running` from the moment the run is created until it finishes,
 * so a console watching a run in progress can tell "still going" from "nothing
 * came back" — and a run killed halfway stays `running` forever, which is the
 * honest record of what happened to it.
 */
export interface ScenarioRunRecord extends ScenarioRunReport {
  runId: string
  status: ScenarioRunStatus
  /** The surface the run targeted: `default`, `browser`, … */
  surface: string
  /** Absent on a run of the whole suite; see {@link ScenarioRunSelection}. */
  selection?: ScenarioRunSelection
  /** The suite version this ran against, when the project has one. */
  version?: ScenarioRunVersion
  startedAt: string
  finishedAt?: string
}

/** Enough of a run to list it without loading its steps and stacks. */
export interface ScenarioRunSummary {
  runId: string
  environment: string
  surface: string
  version?: ScenarioRunVersion
  status: ScenarioRunStatus
  startedAt: string
  finishedAt?: string
  durationMs?: number
  passed: number
  failed: number
  skipped: number
  /** Whether anything is there to watch, so a list can say so without a second read. */
  artifacts: number
}

/**
 * Where runs are kept.
 *
 * Deliberately not the workflow service: a scenario run is a workflow run under
 * the hood, but its history has a different lifetime, a different audience, and
 * a different home — a JSON file beside the project locally, a project-scoped
 * table and an object store when hosted.
 *
 * Written progressively rather than at the end, so a suite that dies on its
 * fortieth scenario still leaves the thirty-nine behind.
 */
export interface ScenarioRunStore {
  /** Open a run. Called before the first scenario, with `status: 'running'`. */
  start(record: ScenarioRunRecord): Promise<void>
  /**
   * File one scenario's state against an open run, replacing whatever was
   * filed for that name before — a scenario is recorded twice, once as
   * `running` and once with its outcome.
   */
  recordScenario(runId: string, result: ScenarioResult): Promise<void>
  /**
   * File the run's artifacts against the scenarios that produced them.
   *
   * Separate from `recordScenario` because a scenario's video does not exist
   * when the scenario ends — it is finalised by the next scenario's reset, and
   * renamed again when the run closes. Artifacts are matched to a result by the
   * label the report knows it under.
   */
  attachArtifacts(runId: string, artifacts: ScenarioArtifact[]): Promise<void>
  /** Close a run, settling everything only known once every scenario has run. */
  finish(
    runId: string,
    outcome: Pick<
      ScenarioRunRecord,
      'status' | 'finishedAt' | 'skipped' | 'hookFailures'
    >
  ): Promise<void>
  /**
   * The bytes of one artifact, by the `path` its record carries.
   *
   * Reading goes through the store because only the store knows where a run's
   * files actually are — a directory beside the project, or an object store
   * behind a bucket. Absent when the run or the path is unknown, which is also
   * the answer for a path that tries to leave the run.
   *
   * The bytes are backed by their own `ArrayBuffer` so they can be handed
   * straight to a `Response` — a view onto a pooled or shared buffer is not a
   * valid body.
   */
  readArtifact(
    runId: string,
    path: string
  ): Promise<{ body: Uint8Array<ArrayBuffer>; contentType: string } | undefined>
  /** Most recent first. */
  list(options?: { limit?: number }): Promise<ScenarioRunSummary[]>
  get(runId: string): Promise<ScenarioRunRecord | undefined>
  /** Forget a run and everything it filed. */
  remove(runId: string): Promise<void>
}
