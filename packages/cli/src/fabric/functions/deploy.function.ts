import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext } from '../lib/config.js'
import { getRpc } from '../lib/http.js'
import { assertDeploySafety, resolveRef } from '../lib/git.js'

export const FabricDeployInput = z.object({
  /** Branch to deploy. Defaults to the current git branch when omitted. */
  branch: z.string().optional(),
  ref: z.string().optional(),
  message: z.string().optional(),
  dryRun: z.boolean().optional(),
  yes: z.boolean().optional(),
})

export const FabricDeployOutput = z.object({
  deploymentId: z.string(),
  stageId: z.string(),
  runId: z.string(),
  ref: z.string(),
})

export const FabricDeploy = pikkuSessionlessFunc({
  description: 'Build + deploy the current project branch to its stage.',
  input: FabricDeployInput,
  output: FabricDeployOutput,
  func: async (_services, { branch, ref, dryRun }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token) {
      throw new Error('Not logged in. Run `pikku fabric login` first.')
    }
    if (!ctx.projectId) {
      throw new Error(
        'No fabric project linked. Run `pikku fabric link` first.'
      )
    }

    const safety = await assertDeploySafety()
    const targetBranch = branch ?? safety.branch
    const resolved = ref ? ((await resolveRef(ref)) ?? ref) : safety.headSha
    if (resolved !== safety.headSha) {
      console.log(`[fabric] deploying ref ${ref} → ${resolved.slice(0, 8)}`)
    }

    if (dryRun) {
      console.log(
        `[fabric] dry-run: would deploy ${ctx.projectId} branch=${targetBranch} ref=${resolved.slice(0, 8)}`
      )
      return { deploymentId: '', stageId: '', runId: '', ref: resolved }
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
  },
})
