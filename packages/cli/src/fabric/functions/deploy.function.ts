import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { assertNamedBranchDeploySafety, resolveRef } from '../lib/git.js'
import { promptConfirm } from '../lib/prompt.js'
import { added, changed, dim } from '../lib/output.js'

export const FabricDeployInput = z.object({
  branch: z.string().optional(),
  production: z.boolean().optional(),
  ref: z.string().optional(),
  message: z.string().optional(),
  autoApply: z.boolean().optional(),
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

// `plan` resolves the target ref and reports what a deploy would do — nothing
// is queued, so there is no deploymentId/stageId/runId yet. `apply` carries
// those once the deploy is queued. The two intentionally have distinct shapes
// rather than one shape padded with empty-string sentinels.
export const FabricDeployPlanOutput = z.object({
  projectId: z.string(),
  branch: z.string(),
  ref: z.string(),
  requestedRef: z.string().optional(),
})

export const FabricDeployApplyOutput = z.object({
  projectId: z.string(),
  branch: z.string(),
  ref: z.string(),
  deploymentId: z.string(),
  stageId: z.string(),
  runId: z.string(),
})

type DeployInput = z.infer<typeof FabricDeployInput>

/**
 * Shared prep for `deploy plan` and `deploy apply`: authenticate, resolve the
 * target branch, and resolve the ref to a concrete sha. Returns everything both
 * subcommands need; neither prints — human output lives in the renders.
 */
async function prepDeploy({ branch, production, ref }: DeployInput) {
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
  const requestedRef = ref && resolved !== safety.headSha ? ref : undefined
  return {
    ctx,
    projectId: ctx.projectId,
    targetBranch,
    resolved,
    requestedRef,
    safety,
  }
}

export const FabricDeployPlan = pikkuSessionlessFunc({
  description: 'Resolve the target ref and report what a deploy would do.',
  input: FabricDeployValidatedInput,
  output: FabricDeployPlanOutput,
  func: async (_services, input) => {
    const { projectId, targetBranch, resolved, requestedRef } =
      await prepDeploy(input)
    return { projectId, branch: targetBranch, ref: resolved, requestedRef }
  },
})

export const FabricDeployApply = pikkuSessionlessFunc({
  description: 'Build + deploy a named branch or production (main).',
  input: FabricDeployValidatedInput,
  output: FabricDeployApplyOutput,
  func: async (_services, input) => {
    const { ctx, projectId, targetBranch, resolved, safety } =
      await prepDeploy(input)

    // Classic yes/no guard. `--auto-apply` skips it; a non-interactive session
    // has no human to answer, so we refuse rather than hang.
    if (!input.autoApply) {
      const target = `${targetBranch} @ ${resolved.slice(0, 8)}`
      if (!process.stdin.isTTY) {
        throw new Error(
          `Refusing to deploy ${target} without confirmation — re-run with --auto-apply to deploy non-interactively.`
        )
      }
      const ok = await promptConfirm(`Deploy ${target}?`)
      if (!ok) {
        throw new Error('Deploy aborted.')
      }
    }

    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const result = await rpc.invoke('deployByStageKind', {
      projectId,
      branch: targetBranch,
      ref: resolved,
      expectedHeadSha: safety.headSha,
    })

    return {
      projectId,
      branch: targetBranch,
      ref: resolved,
      deploymentId: result.deploymentId,
      stageId: result.stageId,
      runId: result.runId,
    }
  },
})

export const renderDeployPlan = (
  _s: unknown,
  {
    projectId,
    branch,
    ref,
    requestedRef,
  }: z.infer<typeof FabricDeployPlanOutput>
): void => {
  if (requestedRef) {
    console.log(dim(`retargeted ${requestedRef} → ${ref.slice(0, 8)}`))
  }
  console.log(
    `${changed('plan')} ${dim('would deploy')} ${branch} ${dim('@')} ${ref.slice(0, 8)} ${dim(`(${projectId})`)}`
  )
  // The coloured added/changed/removed manifest diff lands here once `plan`
  // returns it from the preview workflow.
  console.log(dim('Run `pikku fabric deploy apply` to execute.'))
}

export const renderDeployApply = (
  _s: unknown,
  { branch, ref, deploymentId }: z.infer<typeof FabricDeployApplyOutput>
): void => {
  console.log(
    `${added('queued')} deploy ${branch} ${dim('@')} ${ref.slice(0, 8)} ${dim('·')} ${deploymentId}`
  )
}
