import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext } from '../lib/config.js'
import { getRpc } from '../lib/http.js'

export const FabricRollbackInput = z.object({
  branch: z.string(),
  target: z.string().optional(),
  list: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  yes: z.boolean().optional(),
})

export const FabricRollbackOutput = z.object({
  deploymentId: z.string().optional(),
  rolledBackToDeploymentId: z.string().optional(),
  candidates: z.array(
    z.object({
      deploymentId: z.string(),
      gitSha: z.string().nullable(),
      artifactHash: z.string().nullable(),
      deployedAt: z.string().nullable(),
      versionMajor: z.number(),
      versionMinor: z.number(),
      versionPatch: z.number(),
    })
  ),
})

export const FabricRollback = pikkuSessionlessFunc({
  description:
    'Roll live production back to a previous deployment artifact, gated by schema-snapshot compatibility.',
  input: FabricRollbackInput,
  output: FabricRollbackOutput,
  func: async (_services, { target, list, dryRun }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new Error('Not logged in. Run `pikku fabric login` first.')
    if (!ctx.projectId)
      throw new Error(
        'No fabric project linked. Run `pikku fabric link` first.'
      )
    const rpc = getRpc({ apiUrl: ctx.apiUrl, token: ctx.token })

    // --list (or no target) → just show candidates.
    if (list || !target) {
      const result = await rpc.invoke('rollbackDeployment', {
        projectId: ctx.projectId,
      })
      if (result.candidates.length === 0) {
        console.log('[fabric] no rollback candidates available')
      } else {
        console.log('[fabric] rollback candidates (newest first):')
        for (const c of result.candidates) {
          const v = `v${c.versionMajor}.${c.versionMinor}.${c.versionPatch}`
          const sha = c.gitSha ? c.gitSha.slice(0, 8) : '—'
          console.log(
            `  ${c.deploymentId}  ${v}  sha=${sha}  ${c.deployedAt ?? '—'}`
          )
        }
      }
      return { candidates: result.candidates }
    }

    if (dryRun) {
      console.log(`[fabric] dry-run: would roll back live → ${target}`)
      return { candidates: [] }
    }

    const result = await rpc.invoke('rollbackDeployment', {
      projectId: ctx.projectId,
      target,
    })
    console.log(
      `[fabric] rollback queued: new live=${result.deploymentId} (artifact from ${result.rolledBackToDeploymentId})`
    )
    return {
      deploymentId: result.deploymentId,
      rolledBackToDeploymentId: result.rolledBackToDeploymentId,
      candidates: result.candidates,
    }
  },
})
