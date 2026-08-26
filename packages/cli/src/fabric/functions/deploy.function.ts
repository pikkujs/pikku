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
  missingConfigHints,
  changesAreEmpty,
  classifyStatus,
  describeDeployment,
  destructiveMigrations,
  isApprovable,
  readDeploymentStatus,
  readWorkers,
  reconcileDeployedRef,
  stateLabel,
  waitForDeployment,
  type BlockedReason,
  type DeploymentStatus,
  type MigrationRisk,
  type ProgressEvent,
} from '../lib/deployment.js'

const DEFAULT_TIMEOUT_SECONDS = 900

export const FabricDeployInput = z.object({
  branch: z.string().optional(),
  production: z.boolean().optional(),
  ref: z.string().optional(),
  deploymentId: z.string().optional(),
  sync: z.boolean().optional(),
  autoApprove: z.boolean().optional(),
  allowDestructive: z.boolean().optional(),
  timeout: z.number().optional(),
  json: z.boolean().optional(),
})

export const FabricDeployValidatedInput = FabricDeployInput.superRefine(
  (value, ctx) => {
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
  migrationRisks: z.array(
    z.object({
      name: z.string(),
      level: z.enum(['destructive', 'safe']),
      reasons: z.array(z.string()),
    })
  ),
})

export const FabricDeployApplyOutput = z.object({
  event: z.literal('result'),
  outcome: z.enum(['queued', 'succeeded', 'failed', 'blocked', 'timeout']),
  projectId: z.string(),
  deploymentId: z.string(),
  branch: z.string().optional(),
  ref: z.string().optional(),
  status: z.string().optional(),
  statusReason: z.string().nullable().optional(),
  stageId: z.string().optional(),
  runId: z.string().optional(),
  blockedReason: z
    .enum(['awaiting_approval', 'needs_config', 'needs_attention', 'unknown'])
    .optional(),
  missingSecrets: z.array(MissingConfig).optional(),
  missingVariables: z.array(MissingConfig).optional(),
  approvalWithheld: z.literal('destructive_migrations').optional(),
  changes: Changes.optional(),
  workers: z
    .array(z.object({ name: z.string(), role: z.string(), status: z.string() }))
    .optional(),
  url: z.string().nullable().optional(),
  approved: z.boolean().optional(),
  elapsedMs: z.number().optional(),
  timeoutSeconds: z.number().optional(),
})

type DeployInput = z.infer<typeof FabricDeployInput>
type ApplyOutput = z.infer<typeof FabricDeployApplyOutput>
type FabricRPC = ReturnType<typeof getFabricRPC>

/**
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
    const emit = input.json
      ? (event: ProgressEvent) => console.log(JSON.stringify(event))
      : () => {}

    const timeoutSeconds = input.timeout ?? DEFAULT_TIMEOUT_SECONDS
    if (timeoutSeconds <= 0) {
      throw new Error('--timeout must be a positive number of seconds.')
    }

    if (input.deploymentId && (input.branch || input.production)) {
      throw new Error(
        '--deployment-id already names its target — drop --branch/--production.'
      )
    }

    const attaching = Boolean(input.deploymentId)
    let projectId: string
    let deploymentId: string
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

      // Read the commit back off the deployment rather than repeating the one
      // that was asked for: `deployByStageKind` attaches to an already-parked
      // plan for the branch instead of cutting a new one, and that plan is
      // pinned to whatever commit it was created at.
      ref = reconcileDeployedRef({
        requested: resolved,
        actual:
          (await describeDeployment(rpc, projectId, deploymentId))?.gitSha ??
          null,
        deploymentId,
      })
      emit({ event: 'created', deploymentId, branch, ref })
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

    if (!input.sync && !attaching) {
      return { ...base, outcome: 'queued' as const }
    }

    let approvalWithheld: ApplyOutput['approvalWithheld']

    const approveGate = async (status: DeploymentStatus): Promise<boolean> => {
      const described = await describeDeployment(rpc, projectId, deploymentId)
      const destructive = destructiveMigrations(described?.changes)

      if (destructive.length > 0 && !input.allowDestructive) {
        if (input.autoApprove || input.json || !process.stdin.isTTY) {
          approvalWithheld = 'destructive_migrations'
          return false
        }
      } else if (input.autoApprove) {
        return true
      }
      if (input.json || !process.stdin.isTTY) return false

      const warning =
        destructive.length > 0
          ? `\n${destructiveLines(destructive).join('\n')}\n`
          : ''
      return promptConfirm(
        `Plan for ${branch ?? deploymentId} is ready to publish (${stateLabel(
          status.status,
          status.statusReason
        )}).${warning} Approve?`
      )
    }

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
            ...(approvalWithheld ? { approvalWithheld } : {}),
          }
        : {}),
      ...finished,
    }
  },
})

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

const shortList = (names: string[], limit = 8): string =>
  names.length <= limit
    ? names.join(', ')
    : `${names.slice(0, limit).join(', ')} +${names.length - limit} more`

const destructiveLines = (risks: MigrationRisk[]): string[] =>
  risks.map(
    (r) =>
      `  ${removed('! destructive')} ${r.name}${
        r.reasons.length > 0 ? dim(` (${r.reasons.join(', ')})`) : ''
      }`
  )

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
  lines.push(...destructiveLines(destructiveMigrations(changes)))
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
    if (result.approvalWithheld === 'destructive_migrations') {
      console.log(
        dim(
          'The plan drops or rewrites data. Nothing was published — review the migrations above, then re-run with `--allow-destructive` to accept them.'
        )
      )
      console.log(
        dim(
          `\`pikku fabric deploy apply --deployment-id ${deploymentId} --sync --auto-approve --allow-destructive\``
        )
      )
    } else if (isApprovable(reason) && !approved) {
      console.log(
        dim(
          `Approve it with \`pikku fabric deploy apply --deployment-id ${deploymentId} --sync --auto-approve\`.`
        )
      )
    } else if (reason === 'needs_config') {
      for (const hint of missingConfigHints(
        result.missingSecrets,
        result.missingVariables
      )) {
        console.log(dim(hint))
      }
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
