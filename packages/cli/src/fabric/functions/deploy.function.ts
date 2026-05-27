import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext } from '../lib/config.js'
import { getRpc } from '../lib/http.js'
import { assertNamedBranchDeploySafety, resolveRef } from '../lib/git.js'
import { promptConfirm } from '../lib/prompt.js'

export const FabricDeployInput = z.object({
  branch: z.string().optional(),
  production: z.boolean().optional(),
  ref: z.string().optional(),
  message: z.string().optional(),
  yes: z.boolean().optional(),
})

export const FabricDeployValidatedInput = FabricDeployInput.superRefine(
  (value, ctx) => {
    if (!!value.branch === !!value.production) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Pass exactly one of --branch or --production.',
      })
    }
  }
)

export const FabricDeployOutput = z.object({
  deploymentId: z.string(),
  stageId: z.string(),
  runId: z.string(),
  ref: z.string(),
})

type DeployInput = z.infer<typeof FabricDeployInput>

/**
 * Shared core for `deploy plan` and `deploy apply`. The subcommand name is the
 * mode — there is intentionally no `--dry-run` flag: `plan` resolves the target
 * ref and reports what would happen without queueing anything, `apply` queues
 * the real deploy.
 */
async function runDeploy(
  { branch, production, ref, yes }: DeployInput,
  { plan }: { plan: boolean }
): Promise<z.infer<typeof FabricDeployOutput>> {
  const ctx = await resolveApiContext()
  if (!ctx.token) {
    throw new Error('Not logged in. Run `pikku fabric login` first.')
  }
  if (!ctx.projectId) {
    throw new Error('No fabric project linked. Run `pikku fabric link` first.')
  }

  const targetBranch = production ? 'main' : branch!
  const safety = await assertNamedBranchDeploySafety(targetBranch)
  const resolved = ref ? ((await resolveRef(ref)) ?? ref) : safety.headSha
  if (ref && resolved !== safety.headSha) {
    console.log(`[fabric] deploying ref ${ref} → ${resolved.slice(0, 8)}`)
  }

  if (plan) {
    console.log(
      `[fabric] plan: would deploy ${ctx.projectId} branch=${targetBranch} ref=${resolved.slice(0, 8)}`
    )
    return { deploymentId: '', stageId: '', runId: '', ref: resolved }
  }

  // Classic yes/no guard. `--yes` skips it; a non-interactive session has no
  // human to answer, so we refuse rather than hang.
  if (!yes) {
    const target = `${targetBranch} @ ${resolved.slice(0, 8)}`
    if (!process.stdin.isTTY) {
      throw new Error(
        `Refusing to deploy ${target} without confirmation — re-run with --yes to deploy non-interactively.`
      )
    }
    const ok = await promptConfirm(`Deploy ${target}?`)
    if (!ok) {
      throw new Error('Deploy aborted.')
    }
  }

  const rpc = getRpc({ apiUrl: ctx.apiUrl, token: ctx.token })
  const result = await rpc.invoke('deployByStageKind', {
    projectId: ctx.projectId,
    branch: targetBranch,
    ref: resolved,
    expectedHeadSha: safety.headSha,
  })

  console.log(
    `[fabric] queued deploy: branch=${targetBranch} deploymentId=${result.deploymentId} ref=${resolved.slice(0, 8)}`
  )
  return {
    deploymentId: result.deploymentId,
    stageId: result.stageId,
    runId: result.runId,
    ref: resolved,
  }
}

export const FabricDeployPlan = pikkuSessionlessFunc({
  description: 'Resolve the target ref and report what a deploy would do.',
  input: FabricDeployValidatedInput,
  output: FabricDeployOutput,
  func: async (_services, input) => runDeploy(input, { plan: true }),
})

export const FabricDeployApply = pikkuSessionlessFunc({
  description: 'Build + deploy a named branch or production (main).',
  input: FabricDeployValidatedInput,
  output: FabricDeployOutput,
  func: async (_services, input) => runDeploy(input, { plan: false }),
})
