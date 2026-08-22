import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { assertNamedBranchDeploySafety, resolveRef } from '../lib/git.js'
import { promptConfirm } from '../lib/prompt.js'
import { added, changed, removed, dim, table } from '../lib/output.js'
import {
  blockedReason,
  blockedSummary,
  changesAreEmpty,
  classifyStatus,
  describeDeployment,
  isApprovable,
  readDeploymentStatus,
  readWorkers,
  stateLabel,
  waitForDeployment,
  type BlockedReason,
  type DeploymentStatus,
  type ProgressEvent,
} from '../lib/deployment.js'

/** 15 minutes. A cold fabric deploy builds every unit from a clean clone. */
const DEFAULT_TIMEOUT_SECONDS = 900

export const FabricDeployInput = z.object({
  branch: z.string().optional(),
  production: z.boolean().optional(),
  ref: z.string().optional(),
  deploymentId: z.string().optional(),
  sync: z.boolean().optional(),
  autoApprove: z.boolean().optional(),
  timeout: z.number().optional(),
  json: z.boolean().optional(),
})

export const FabricDeployValidatedInput = FabricDeployInput.superRefine(
  (value, ctx) => {
    // A deployment id already fixes the stage, the branch and the sha. Taking
    // a target as well would let the two disagree, and there is no honest
    // answer to which one wins.
    if (value.deploymentId) {
      if (value.branch || value.production) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            '--deployment-id already names its target — drop --branch/--production.',
        })
      }
      return
    }
    if (!!value.branch === !!value.production) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Pass exactly one of --branch or --production.',
      })
    }
  }
)

const MissingConfig = z.object({
  name: z.string(),
  displayName: z.string().nullable(),
  description: z.string().nullable(),
  docsUrl: z.string().nullable(),
})

const Changes = z.object({
  unitsAdded: z.array(z.string()),
  unitsRemoved: z.array(z.string()),
  handlersAdded: z.array(z.string()),
  handlersRemoved: z.array(z.string()),
  workflowsAdded: z.array(z.string()),
  workflowsRemoved: z.array(z.string()),
  workflowsChanged: z.array(z.string()),
  functionsAdded: z.array(z.string()),
  functionsRemoved: z.array(z.string()),
  secretsChanged: z.array(z.string()),
  variablesChanged: z.array(z.string()),
  pendingMigrations: z.array(z.string()),
})

/**
 * One command, five endings — and the fields that belong to only some of them
 * stay absent rather than present-and-empty. A bare `apply` genuinely has no
 * status to report because it never looked, which is a different claim from
 * `status: ''`. `outcome` is the discriminator; read it first.
 */
export const FabricDeployApplyOutput = z.object({
  /** Names this object as the terminal line of the NDJSON progress stream. */
  event: z.literal('result'),
  outcome: z.enum(['queued', 'succeeded', 'failed', 'blocked', 'timeout']),
  projectId: z.string(),
  deploymentId: z.string(),
  /** Absent only when attaching to a deployment the project listing dropped. */
  branch: z.string().optional(),
  /** Created deploys only — the sha we resolved and asked fabric to build. */
  ref: z.string().optional(),
  /** Present once anything has been read back from the server. */
  status: z.string().optional(),
  statusReason: z.string().nullable().optional(),
  /** Created deploys only. */
  stageId: z.string().optional(),
  runId: z.string().optional(),
  /** `blocked` only. */
  blockedReason: z
    .enum(['awaiting_approval', 'needs_config', 'needs_attention', 'unknown'])
    .optional(),
  missingSecrets: z.array(MissingConfig).optional(),
  missingVariables: z.array(MissingConfig).optional(),
  /** Terminal reads only — what this deployment changes against the live one. */
  changes: Changes.optional(),
  /** `succeeded` only. */
  workers: z
    .array(z.object({ name: z.string(), role: z.string(), status: z.string() }))
    .optional(),
  url: z.string().nullable().optional(),
  approved: z.boolean().optional(),
  /** Waits only. */
  elapsedMs: z.number().optional(),
  timeoutSeconds: z.number().optional(),
})

type DeployInput = z.infer<typeof FabricDeployInput>
type ApplyOutput = z.infer<typeof FabricDeployApplyOutput>
type FabricRPC = ReturnType<typeof getFabricRPC>

/**
 * Auth + target resolution for a *created* deploy: authenticate, resolve the
 * target branch, resolve the ref to a concrete sha. `--deployment-id` skips
 * all of it — the deployment already pins a sha, and the local checkout has
 * every right to have moved on since.
 */
async function prepDeploy({ branch, production, ref }: DeployInput) {
  const ctx = await resolveApiContext()
  if (!ctx.token) {
    throw new Error('Not logged in. Run `pikku fabric login` first.')
  }
  if (!ctx.projectId) {
    throw new Error('No fabric project linked. Run `pikku fabric link` first.')
  }

  // Guarded rather than asserted: the schema-level refine is bypassed whenever
  // the function is called outside CLI arg parsing, and `branch!` turned that
  // into "local branch undefined does not exist" — an error that names nothing.
  if (!production && !branch) {
    throw new Error('Pass exactly one of --branch or --production.')
  }
  const targetBranch = production ? 'main' : branch!
  const safety = await assertNamedBranchDeploySafety(targetBranch)
  const resolved = ref ? ((await resolveRef(ref)) ?? ref) : safety.headSha
  return { ctx, projectId: ctx.projectId, targetBranch, resolved, safety }
}

/** Auth only — the attach path has no branch to check and no tree to compare. */
async function prepAttach() {
  const ctx = await resolveApiContext()
  if (!ctx.token) {
    throw new Error('Not logged in. Run `pikku fabric login` first.')
  }
  if (!ctx.projectId) {
    throw new Error('No fabric project linked. Run `pikku fabric link` first.')
  }
  return { ctx, projectId: ctx.projectId }
}

/**
 * Exit codes, set via `process.exitCode` rather than thrown, because the
 * result still has to be rendered — a thrown CLIError never reaches a
 * renderer, and under `--json` the terminal event is the whole point of the
 * run. The bin exits with `process.exitCode ?? 0`.
 *
 *   0  deployed, already live, or queued (bare apply)
 *   1  the command could not run: not logged in, unsafe git state, bad flags
 *   2  the deployment reached a terminal failure
 *   3  the deployment is blocked and nothing here can unblock it
 *   4  the wait timed out with the deployment still in flight
 */
const EXIT_BY_OUTCOME: Record<ApplyOutput['outcome'], number> = {
  queued: 0,
  succeeded: 0,
  failed: 2,
  blocked: 3,
  timeout: 4,
}

export const FabricDeployApply = pikkuSessionlessFunc({
  description:
    'Build + deploy a named branch or production (main), or attach to an existing deployment.',
  input: FabricDeployValidatedInput,
  output: FabricDeployApplyOutput,
  func: async (_services, input) => {
    // knowledge: decisions/internals/cli-stdout-is-reserved-for-machine-readable-output.md
    // Progress has to leave the function as it happens — the renderer only
    // runs once, at the end. Under `--json` that is NDJSON on stdout; the
    // human path stays silent here and says everything in the render.
    const emit = input.json
      ? (event: ProgressEvent) => console.log(JSON.stringify(event))
      : () => {}

    const timeoutSeconds = input.timeout ?? DEFAULT_TIMEOUT_SECONDS
    if (timeoutSeconds <= 0) {
      throw new Error('--timeout must be a positive number of seconds.')
    }

    // Guarded rather than asserted: `superRefine` is a zod-level check, and
    // the generated JSON schema the runtime validates against does not carry
    // it — so a caller reaching the function any other way needs the rule
    // enforced here too.
    if (input.deploymentId && (input.branch || input.production)) {
      throw new Error(
        '--deployment-id already names its target — drop --branch/--production.'
      )
    }

    const attaching = Boolean(input.deploymentId)
    let projectId: string
    let deploymentId: string
    // Absent when attaching to a deployment the project listing no longer
    // carries — the status read still knows everything that decides the exit.
    let branch: string | undefined
    let ref: string | undefined
    let stageId: string | undefined
    let runId: string | undefined
    let rpc: FabricRPC

    if (attaching) {
      const { ctx, projectId: id } = await prepAttach()
      projectId = id
      rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
      deploymentId = input.deploymentId!
      // `getDeploymentStatus` is the existence check, not the project listing:
      // it reads the row by id and 404s if there isn't one, whereas
      // `getProjectDeployments` is a *filtered* listing — a cancelled deploy is
      // usually dismissed and would come back "not found" when it exists and
      // has a perfectly good terminal status to report. The listing is still
      // worth a call, for the branch name and the diff, but only as a bonus.
      const current = await readDeploymentStatus(rpc, deploymentId)
      stageId = current.stageId
      branch = (await describeDeployment(rpc, projectId, deploymentId))?.branch
      emit({ event: 'attached', deploymentId, status: current.status })
    } else {
      const {
        ctx,
        projectId: id,
        targetBranch,
        resolved,
        safety,
      } = await prepDeploy(input)
      projectId = id
      branch = targetBranch
      ref = resolved
      rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })

      // Classic yes/no guard on *creating* a deployment. `--auto-approve`
      // supplies the answer; a non-interactive session has no human to ask, so
      // we refuse rather than hang.
      if (!input.autoApprove) {
        const target = `${branch} @ ${resolved.slice(0, 8)}`
        if (!process.stdin.isTTY) {
          throw new Error(
            `Refusing to deploy ${target} without confirmation — re-run with --auto-approve to deploy non-interactively.`
          )
        }
        if (!(await promptConfirm(`Deploy ${target}?`))) {
          throw new Error('Deploy aborted.')
        }
      }

      const created = await rpc.invoke('deployByStageKind', {
        projectId,
        branch,
        ref: resolved,
        expectedHeadSha: safety.headSha,
      })
      deploymentId = created.deploymentId
      stageId = created.stageId
      runId = created.runId
      emit({ event: 'created', deploymentId, branch, ref: resolved })
    }

    const base = {
      event: 'result' as const,
      projectId,
      deploymentId,
      branch,
      ...(ref ? { ref } : {}),
      ...(stageId ? { stageId } : {}),
      ...(runId ? { runId } : {}),
    }

    // Fire and forget: created, id returned, nothing waited on.
    if (!input.sync && !attaching) {
      return { ...base, outcome: 'queued' as const }
    }

    /**
     * Approving is a second decision, distinct from "create this deployment",
     * and `--auto-approve` answers both. Without it an interactive session is
     * asked and every other session is told, so a parked plan surfaces as
     * exit 3 rather than an auto-publish nobody sanctioned. `--json` never
     * prompts: its stdout belongs to the event stream.
     */
    const approveGate = async (status: DeploymentStatus): Promise<boolean> => {
      if (input.autoApprove) return true
      if (input.json || !process.stdin.isTTY) return false
      return promptConfirm(
        `Plan for ${branch ?? deploymentId} is ready to publish (${stateLabel(
          status.status,
          status.statusReason
        )}). Approve?`
      )
    }

    // `--deployment-id` without `--sync` is a status read, not a wait.
    if (!input.sync) {
      const status = await readDeploymentStatus(rpc, deploymentId)
      const klass = classifyStatus(status.status)
      const outcome: ApplyOutput['outcome'] =
        klass === 'in_flight' ? 'queued' : klass
      const finished = await finalise(
        rpc,
        projectId,
        deploymentId,
        status.stageId,
        outcome
      )
      process.exitCode = EXIT_BY_OUTCOME[outcome]
      return {
        ...base,
        outcome,
        status: status.status,
        statusReason: status.statusReason,
        url: status.hostname ? `https://${status.hostname}` : null,
        ...(outcome === 'blocked'
          ? {
              blockedReason: blockedReason(status.statusReason),
              missingSecrets: status.missingSecrets,
              missingVariables: status.missingVariables,
            }
          : {}),
        ...finished,
      }
    }

    const waited = await waitForDeployment({
      rpc,
      deploymentId,
      timeoutMs: timeoutSeconds * 1000,
      approve: approveGate,
      onEvent: emit,
    })

    const finished = await finalise(
      rpc,
      projectId,
      deploymentId,
      waited.stageId,
      waited.outcome
    )

    process.exitCode = EXIT_BY_OUTCOME[waited.outcome]
    return {
      ...base,
      outcome: waited.outcome,
      status: waited.status,
      statusReason: waited.statusReason,
      approved: waited.approved,
      elapsedMs: waited.elapsedMs,
      url: waited.hostname ? `https://${waited.hostname}` : null,
      ...(waited.outcome === 'timeout' ? { timeoutSeconds } : {}),
      ...(waited.outcome === 'blocked'
        ? {
            blockedReason: waited.reason ?? 'unknown',
            missingSecrets: waited.missingSecrets,
            missingVariables: waited.missingVariables,
          }
        : {}),
      ...finished,
    }
  },
})

/**
 * The reads worth one round-trip each, once the wait is over: what this
 * deployment changes (only `getProjectDeployments` carries the diff) and, on
 * success, what is actually running. Never called from the poll loop.
 */
async function finalise(
  rpc: FabricRPC,
  projectId: string,
  deploymentId: string,
  stageId: string,
  outcome: ApplyOutput['outcome']
): Promise<Partial<ApplyOutput>> {
  const out: Partial<ApplyOutput> = {}
  if (outcome === 'queued') return out
  const described = await describeDeployment(rpc, projectId, deploymentId)
  if (described?.changes) out.changes = described.changes
  if (outcome === 'succeeded') {
    out.workers = await readWorkers(rpc, stageId)
  }
  return out
}

// ── renders ────────────────────────────────────────────────────────────────

const shortList = (names: string[], limit = 8): string =>
  names.length <= limit
    ? names.join(', ')
    : `${names.slice(0, limit).join(', ')} +${names.length - limit} more`

const changeLines = (changes: ApplyOutput['changes']): string[] => {
  if (!changes || changesAreEmpty(changes)) return []
  const lines: string[] = []
  const add = (
    label: string,
    names: string[],
    colour: (s: string) => string
  ) => {
    if (names.length > 0) lines.push(`  ${colour(label)} ${shortList(names)}`)
  }
  add('+ units', changes.unitsAdded, added)
  add('- units', changes.unitsRemoved, removed)
  add('+ handlers', changes.handlersAdded, added)
  add('- handlers', changes.handlersRemoved, removed)
  add('+ functions', changes.functionsAdded, added)
  add('- functions', changes.functionsRemoved, removed)
  add('+ workflows', changes.workflowsAdded, added)
  add('- workflows', changes.workflowsRemoved, removed)
  add('~ workflows', changes.workflowsChanged, changed)
  add('~ secrets', changes.secretsChanged, changed)
  add('~ variables', changes.variablesChanged, changed)
  add('~ migrations', changes.pendingMigrations, changed)
  return lines
}

const missingLines = (
  label: string,
  entries: ApplyOutput['missingSecrets']
): string[] => {
  if (!entries || entries.length === 0) return []
  return [
    `  ${removed(label)}`,
    ...entries.map(
      (e) =>
        `    ${e.name}${e.displayName ? dim(` (${e.displayName})`) : ''}${
          e.docsUrl ? dim(` — ${e.docsUrl}`) : ''
        }`
    ),
  ]
}

const reattachHint = (deploymentId: string): string =>
  dim(
    `Re-attach with \`pikku fabric deploy apply --deployment-id ${deploymentId} --sync\`.`
  )

export const renderDeployApply = (_s: unknown, result: ApplyOutput): void => {
  const {
    outcome,
    branch,
    ref,
    deploymentId,
    status,
    statusReason,
    changes,
    workers,
    url,
    elapsedMs,
    timeoutSeconds,
    approved,
  } = result
  // `--deployment-id` against a deployment the project listing has dropped
  // knows the id and nothing else nameable; the id is right there on the line.
  const where = branch ?? 'deployment'
  const at = ref ? ` ${dim('@')} ${ref.slice(0, 8)}` : ''
  const took =
    elapsedMs === undefined ? '' : dim(` in ${Math.round(elapsedMs / 1000)}s`)

  if (outcome === 'queued') {
    console.log(
      `${added('queued')} deploy ${where}${at} ${dim('·')} ${deploymentId}`
    )
    if (status) {
      console.log(dim(`status ${stateLabel(status, statusReason ?? null)}`))
    }
    console.log(reattachHint(deploymentId))
    return
  }

  if (outcome === 'succeeded') {
    console.log(
      `${added('deployed')} ${where}${at} ${dim('·')} ${deploymentId}${took}`
    )
    for (const line of changeLines(changes)) console.log(line)
    if (workers && workers.length > 0) {
      console.log(
        table(
          ['WORKER', 'ROLE', 'STATUS'],
          workers.map((w) => [w.name, w.role, w.status])
        )
      )
    }
    if (url) console.log(dim(url))
    return
  }

  if (outcome === 'blocked') {
    const reason: BlockedReason = result.blockedReason ?? 'unknown'
    console.log(
      `${changed(stateLabel(status ?? 'suspended', statusReason ?? null))} ${where}${at} ${dim('·')} ${deploymentId}`
    )
    console.log(dim(blockedSummary(reason)))
    for (const line of missingLines('missing secrets', result.missingSecrets)) {
      console.log(line)
    }
    for (const line of missingLines(
      'missing variables',
      result.missingVariables
    )) {
      console.log(line)
    }
    for (const line of changeLines(changes)) console.log(line)
    if (isApprovable(reason) && !approved) {
      console.log(
        dim(
          `Approve it with \`pikku fabric deploy apply --deployment-id ${deploymentId} --sync --auto-approve\`.`
        )
      )
    } else if (reason === 'needs_config') {
      console.log(dim('Set the values with `pikku fabric secrets set <name>`.'))
    }
    return
  }

  if (outcome === 'timeout') {
    console.log(
      `${changed('timed out')} after ${timeoutSeconds}s ${dim('·')} ${deploymentId} ${dim(`(still ${status ?? 'in flight'})`)}`
    )
    console.log(reattachHint(deploymentId))
    console.log(dim('Raise the ceiling with `--timeout <seconds>`.'))
    return
  }

  console.log(
    `${removed('failed')} ${where}${at} ${dim('·')} ${deploymentId}${took} ${dim(`(${stateLabel(status ?? 'failed', statusReason ?? null)})`)}`
  )
  if (branch) console.log(dim(`Logs: \`pikku fabric logs --branch ${branch}\``))
}
