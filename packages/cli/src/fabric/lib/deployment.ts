import type { PikkuRPC } from '../sdk/pikku-rpc.gen.js'
import type { GetDeploymentStatusOutput } from '../sdk/rpc-map.gen.d.js'

/** Fabric inlines this shape on `getDeploymentStatus` rather than exporting a
 *  named type, so we derive it instead of restating the fields — a rename or a
 *  new field on fabric's side then lands here as a type error, not a drift. */
type MissingConfigEntry = GetDeploymentStatusOutput['missingSecrets'][number]

/**
 * Deployment status reading, blocker classification, approval, and the
 * `--sync` poll loop.
 *
 * The vocabulary here is fabric's, not ours. A deployment moves
 * `queued → planning → building → deploying → active`, and parks at
 * `suspended` when the plan gate stops it. `suspended` alone says nothing
 * useful, which is why `getDeploymentStatus` carries `statusReason` and this
 * module is built around it: a caller that polls for `active` on a
 * `needs_config` deployment waits out its whole timeout on something that was
 * never going to move.
 */

/** In-flight, per the console's `isInflightDeploymentStatus`. */
const IN_FLIGHT = new Set(['queued', 'planning', 'building', 'deploying'])
/** The one status that means "it worked". The console labels it "live". */
const SUCCEEDED = new Set(['active'])
/** Terminal and not good. */
const FAILED = new Set([
  'failed',
  'error',
  'timed_out',
  'cancelled',
  'rolled_back',
  'stopped',
  'archived',
])

/**
 * Why a `suspended` deployment stopped. Only `awaiting_approval` can be moved
 * by approving — `applyDeployment` throws ConflictError on the other two, so
 * the CLI must not offer to approve them.
 */
export type BlockedReason =
  | 'awaiting_approval'
  | 'needs_config'
  | 'needs_attention'
  | 'unknown'

export type StatusClass = 'in_flight' | 'succeeded' | 'failed' | 'blocked'

export function classifyStatus(status: string): StatusClass {
  if (SUCCEEDED.has(status)) return 'succeeded'
  if (FAILED.has(status)) return 'failed'
  if (status === 'suspended') return 'blocked'
  if (IN_FLIGHT.has(status)) return 'in_flight'
  // An unrecognised status is treated as in-flight rather than terminal — the
  // timeout bounds the wait either way, and guessing "failed" would fail a
  // deploy that fabric simply renamed a phase on.
  return 'in_flight'
}

export function blockedReason(statusReason: string | null): BlockedReason {
  if (
    statusReason === 'awaiting_approval' ||
    statusReason === 'needs_config' ||
    statusReason === 'needs_attention'
  ) {
    return statusReason
  }
  return 'unknown'
}

/** Only a plan parked at the approval gate can be approved. */
export function isApprovable(reason: BlockedReason): boolean {
  return reason === 'awaiting_approval'
}

/** Mirrors the console's `deploymentStateLabel` so both surfaces say the same word. */
export function stateLabel(status: string, statusReason: string | null): string {
  if (status === 'suspended') {
    if (statusReason === 'needs_attention') return 'needs attention'
    if (statusReason === 'needs_config') return 'config required'
    return 'planned'
  }
  if (status === 'active') return 'live'
  if (status === 'rolled_back') return 'rolled back'
  if (status === 'timed_out') return 'timed out'
  return status
}

/** One-line explanation, mirroring the console's `deploymentListSummary`. */
export function blockedSummary(reason: BlockedReason): string {
  switch (reason) {
    case 'needs_attention':
      return 'Plan needs attention before it can deploy'
    case 'needs_config':
      return 'Required config missing — set values before approving'
    case 'awaiting_approval':
      return 'Plan ready — approve to deploy'
    default:
      return 'Deployment is suspended'
  }
}

/** The live status read, narrowed to what the CLI shows. */
export interface DeploymentStatus {
  status: string
  statusReason: string | null
  stageId: string
  hostname: string | null
  missingSecrets: MissingConfigEntry[]
  missingVariables: MissingConfigEntry[]
}

/**
 * The only status read `--sync` may use. `listDeployments` carries no
 * `statusReason`, so polling it can never tell "waiting for you" from
 * "blocked on config" — the exact distinction the whole wait turns on.
 */
export async function readDeploymentStatus(
  rpc: PikkuRPC,
  deploymentId: string
): Promise<DeploymentStatus> {
  const s = await rpc.invoke('getDeploymentStatus', { deploymentId })
  return {
    status: s.status,
    statusReason: s.statusReason,
    stageId: s.stageId,
    hostname: s.hostname,
    missingSecrets: s.missingSecrets,
    missingVariables: s.missingVariables,
  }
}

/**
 * Approve a plan parked at the gate.
 *
 * `applyDeployment` resumes the deployment's suspended workflow run, which
 * replays past the suspend into the deploy phase (publish + activate). It
 * returns as soon as the resume is dispatched — the run finishes
 * asynchronously, so a caller that wants an outcome has to poll after this.
 *
 * It refuses (ConflictError) unless status is `suspended` AND statusReason is
 * `awaiting_approval`, the deployment has a stored artifact, and no other
 * deployment on the same stage is `deploying`. Callers should check
 * `isApprovable` first so the common cases produce our message, not a raw
 * server conflict.
 *
 * The function's `approvalRequired: true` marking on the server is an AI
 * agent tool-call gate (agents must get a human to confirm before calling it),
 * not an extra handshake on a direct RPC — a CLI call needs nothing further.
 */
export async function approveDeployment(
  rpc: PikkuRPC,
  deploymentId: string
): Promise<boolean> {
  const { resumed } = await rpc.invoke('applyDeployment', { deploymentId })
  return resumed
}

/**
 * Fabric's verdict on one pending migration, mirrored from
 * `lib/deploy/migration-risk.ts`. `level` is the only field the gate reads;
 * `reasons` exists so the CLI can say *why* a migration is destructive rather
 * than just flagging it — "drop_table" is the difference between a shrug and
 * a stop.
 */
export interface MigrationRisk {
  name: string
  level: 'destructive' | 'safe'
  reasons: string[]
}

/**
 * The plan block is typed `Record<string, unknown>` end to end — fabric writes
 * it as `as never` and the generated SDK carries no shape for it — so every
 * field has to be narrowed by hand. A malformed entry is dropped rather than
 * thrown on: a plan we cannot parse must not take the deploy down with it.
 */
function parseMigrationRisks(plan: unknown): MigrationRisk[] {
  const raw = (plan as Record<string, unknown> | null | undefined)
    ?.migrationRisks
  if (!Array.isArray(raw)) return []
  const risks: MigrationRisk[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const { name, level, reasons } = entry as Record<string, unknown>
    if (typeof name !== 'string') continue
    if (level !== 'destructive' && level !== 'safe') continue
    risks.push({
      name,
      level,
      reasons: Array.isArray(reasons)
        ? reasons.filter((r): r is string => typeof r === 'string')
        : [],
    })
  }
  return risks
}

/** The pending migrations fabric marked destructive, in plan order. */
export function destructiveMigrations(
  changes: DeploymentChanges | null | undefined
): MigrationRisk[] {
  return (changes?.migrationRisks ?? []).filter(
    (r) => r.level === 'destructive'
  )
}

/** What actually changed, from the deployment's `diff` block. */
export interface DeploymentChanges {
  unitsAdded: string[]
  unitsRemoved: string[]
  handlersAdded: string[]
  handlersRemoved: string[]
  workflowsAdded: string[]
  workflowsRemoved: string[]
  workflowsChanged: string[]
  functionsAdded: string[]
  functionsRemoved: string[]
  secretsChanged: string[]
  variablesChanged: string[]
  pendingMigrations: string[]
  /** Risk verdicts for `pendingMigrations`, one entry per migration fabric judged. */
  migrationRisks: MigrationRisk[]
}

export function changesAreEmpty(changes: DeploymentChanges): boolean {
  return Object.values(changes).every((list) => list.length === 0)
}

const handlerNames = (
  entries: { unit: string; kind: string; id: string }[] | undefined
): string[] => (entries ?? []).map((h) => `${h.unit}/${h.id}`)

/**
 * The whole-project read. It is the only RPC carrying the manifest `diff` and
 * the executed-migration list, and the only way to turn a bare
 * `--deployment-id` into a branch — `getDeploymentStatus` gives a stageId and
 * nothing human-readable. Called once per invocation, never in the poll loop.
 */
export interface DeploymentDescription {
  branch: string
  stageId: string
  gitSha: string | null
  status: string
  statusReason: string | null
  url: string | null
  changes: DeploymentChanges | null
}

export async function describeDeployment(
  rpc: PikkuRPC,
  projectId: string,
  deploymentId: string
): Promise<DeploymentDescription | null> {
  // `includeDismissed` because we are looking one deployment up by id, not
  // browsing history: a cancelled deploy is normally dismissed too, and the
  // default listing would simply not contain it.
  const { stages } = await rpc.invoke('getProjectDeployments', {
    projectId,
    includeDismissed: true,
  })
  for (const stage of stages) {
    for (const deployment of stage.deployments) {
      if (deployment.deploymentId !== deploymentId) continue

      const diff = deployment.diff
      // Mirrors the console's `pendingMigrationNames`: the plan lists every
      // migration the deploy would run, and `migrations` records the ones it
      // already did, so the outstanding set is the difference.
      const executed = new Set(
        (deployment.migrations ?? []).map((m) => m.migrationName)
      )
      const planned = deployment.plan?.pendingMigrations
      const pendingMigrations = Array.isArray(planned)
        ? planned
            .filter((m): m is string => typeof m === 'string')
            .filter((m) => !executed.has(m))
        : []

      // Risks are scoped to what is still outstanding: a migration already
      // applied by an earlier attempt is not a decision this run is making.
      const pending = new Set(pendingMigrations)
      const migrationRisks = parseMigrationRisks(deployment.plan).filter((r) =>
        pending.has(r.name)
      )

      const changes: DeploymentChanges | null = diff
        ? {
            unitsAdded: diff.units.added,
            unitsRemoved: diff.units.removed,
            handlersAdded: handlerNames(diff.handlers.added),
            handlersRemoved: handlerNames(diff.handlers.removed),
            workflowsAdded: diff.workflows.added,
            workflowsRemoved: diff.workflows.removed,
            workflowsChanged: diff.workflows.hashChanged,
            functionsAdded: diff.contracts.addedFunctions,
            functionsRemoved: diff.contracts.removedFunctions,
            secretsChanged: [
              ...diff.secrets.added,
              ...diff.secrets.removed,
              ...diff.secrets.modified,
            ],
            variablesChanged: [
              ...diff.variables.added,
              ...diff.variables.removed,
              ...diff.variables.modified,
            ],
            pendingMigrations,
            migrationRisks,
          }
        : pendingMigrations.length > 0
          ? {
              unitsAdded: [],
              unitsRemoved: [],
              handlersAdded: [],
              handlersRemoved: [],
              workflowsAdded: [],
              workflowsRemoved: [],
              workflowsChanged: [],
              functionsAdded: [],
              functionsRemoved: [],
              secretsChanged: [],
              variablesChanged: [],
              pendingMigrations,
              migrationRisks,
            }
          : null

      return {
        branch: stage.branch,
        stageId: stage.stageId,
        gitSha: deployment.gitSha,
        status: deployment.status,
        statusReason: deployment.statusReason ?? null,
        url: stage.url,
        changes,
      }
    }
  }
  return null
}

export interface DeployedWorker {
  name: string
  role: string
  status: string
}

export async function readWorkers(
  rpc: PikkuRPC,
  stageId: string
): Promise<DeployedWorker[]> {
  const { workers } = await rpc.invoke('listDeploymentWorkers', { stageId })
  return workers.map(({ name, role, status }) => ({ name, role, status }))
}

/** A progress event, emitted as one NDJSON line under `--json`. */
export type ProgressEvent =
  | { event: 'created'; deploymentId: string; branch: string; ref: string }
  | { event: 'attached'; deploymentId: string; status: string }
  | {
      event: 'status'
      deploymentId: string
      status: string
      statusReason: string | null
      elapsedMs: number
    }
  | {
      event: 'blocked'
      deploymentId: string
      reason: BlockedReason
      missingSecrets: string[]
      missingVariables: string[]
    }
  | { event: 'approved'; deploymentId: string }

export type WaitOutcome = 'succeeded' | 'failed' | 'blocked' | 'timeout'

export interface WaitResult {
  outcome: WaitOutcome
  status: string
  statusReason: string | null
  stageId: string
  hostname: string | null
  reason: BlockedReason | null
  missingSecrets: MissingConfigEntry[]
  missingVariables: MissingConfigEntry[]
  approved: boolean
  elapsedMs: number
}

export interface WaitOptions {
  rpc: PikkuRPC
  deploymentId: string
  timeoutMs: number
  /**
   * Called once, when the deployment is found parked at the approval gate.
   * Resolving false ends the wait as `blocked` rather than spinning — nobody
   * is coming.
   */
  approve: (status: DeploymentStatus) => Promise<boolean>
  onEvent: (event: ProgressEvent) => void
  /** Injected by tests so the loop doesn't sleep in real time. */
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

/**
 * How long a deployment may still read `suspended` after we approved it
 * before we call the gate stuck. The resume is dispatched asynchronously, so
 * some lag is normal; thirty seconds is far longer than the transition takes
 * and far shorter than the deploy timeout it would otherwise consume.
 */
const RESUME_GRACE_MS = 30_000

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Poll a deployment to a terminal state.
 *
 * There is no stream to prefer. `fabric logs --follow` polls at 2s and says so
 * in its own comment ("Server-side SSE for logs is a planned upgrade"), and
 * the deployment RPCs are plain request/response — the console polls these
 * same endpoints. So: poll, backing off 2s → 10s, which costs ~100 requests
 * over a fifteen-minute wait instead of 450.
 *
 * A `suspended` deployment ends the wait immediately unless it is at the
 * approval gate and `approve` says yes. `needs_config` and `needs_attention`
 * cannot be approved at all — `applyDeployment` refuses them — so waiting on
 * them is waiting on nothing.
 */
export async function waitForDeployment({
  rpc,
  deploymentId,
  timeoutMs,
  approve,
  onEvent,
  sleep = defaultSleep,
  now = Date.now,
}: WaitOptions): Promise<WaitResult> {
  const startedAt = now()
  const elapsed = () => now() - startedAt
  let delay = 2_000
  let lastStatus: string | null = null
  let approved = false
  let approvedAt = 0
  let lastBlockedReason: BlockedReason | null = null

  const settle = (
    status: DeploymentStatus,
    outcome: WaitOutcome,
    reason: BlockedReason | null
  ): WaitResult => ({
    outcome,
    status: status.status,
    statusReason: status.statusReason,
    stageId: status.stageId,
    hostname: status.hostname,
    reason,
    missingSecrets: status.missingSecrets,
    missingVariables: status.missingVariables,
    approved,
    elapsedMs: elapsed(),
  })

  let latest = await readDeploymentStatus(rpc, deploymentId)

  while (true) {
    if (latest.status !== lastStatus) {
      lastStatus = latest.status
      onEvent({
        event: 'status',
        deploymentId,
        status: latest.status,
        statusReason: latest.statusReason,
        elapsedMs: elapsed(),
      })
    }

    const klass = classifyStatus(latest.status)
    if (klass === 'succeeded') return settle(latest, 'succeeded', null)
    if (klass === 'failed') return settle(latest, 'failed', null)

    if (klass === 'blocked') {
      const reason = blockedReason(latest.statusReason)
      // Emit on entry and on any change of reason, not once per poll: the
      // grace window below can revisit this branch several times.
      if (reason !== lastBlockedReason) {
        lastBlockedReason = reason
        onEvent({
          event: 'blocked',
          deploymentId,
          reason,
          missingSecrets: latest.missingSecrets.map((m) => m.name),
          missingVariables: latest.missingVariables.map((m) => m.name),
        })
      }
      if (!isApprovable(reason)) {
        return settle(latest, 'blocked', reason)
      }
      if (approved) {
        // `applyDeployment` returns once the resume is *dispatched*; the row
        // does not necessarily leave `suspended` by the time we can re-read
        // it. Concluding "the gate is stuck" on the first such read would
        // report blocked for a deploy that is in fact moving, so allow a
        // bounded grace period before giving up — and give up well short of
        // the timeout, since a gate that has not moved in this long is stuck
        // rather than slow.
        if (elapsed() - approvedAt >= RESUME_GRACE_MS) {
          return settle(latest, 'blocked', reason)
        }
        // Fall through to the sleep + re-poll below.
      } else {
        if (!(await approve(latest))) {
          return settle(latest, 'blocked', reason)
        }
        await approveDeployment(rpc, deploymentId)
        approved = true
        approvedAt = elapsed()
        onEvent({ event: 'approved', deploymentId })
        // Re-read straight away rather than sleeping through a transition we
        // just caused; the grace window covers the case where it has not
        // happened yet.
        delay = 2_000
        latest = await readDeploymentStatus(rpc, deploymentId)
        continue
      }
    }

    const remaining = timeoutMs - elapsed()
    if (remaining <= 0) return settle(latest, 'timeout', null)
    await sleep(Math.min(delay, remaining))
    delay = Math.min(delay * 1.5, 10_000)
    latest = await readDeploymentStatus(rpc, deploymentId)
  }
}
