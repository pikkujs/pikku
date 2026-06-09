import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { added, dim, table } from '../lib/output.js'

export const FabricRollbackInput = z.object({
  branch: z.string(),
  target: z.string().optional(),
  list: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  yes: z.boolean().optional(),
})

const RollbackCandidate = z.object({
  deploymentId: z.string(),
  gitSha: z.string().nullable(),
  artifactHash: z.string().nullable(),
  deployedAt: z.string().nullable(),
  versionMajor: z.number(),
  versionMinor: z.number(),
  versionPatch: z.number(),
})

export const FabricRollbackOutput = z.object({
  mode: z.enum(['list', 'dry-run', 'applied']),
  deploymentId: z.string().optional(),
  rolledBackToDeploymentId: z.string().optional(),
  target: z.string().optional(),
  candidates: z.array(RollbackCandidate),
})

type RollbackCandidate = z.infer<typeof RollbackCandidate>

export const renderRollback = (
  _s: unknown,
  result: z.infer<typeof FabricRollbackOutput>
): void => {
  if (result.mode === 'dry-run') {
    console.log(dim(`dry-run: would roll back live → ${result.target}`))
    return
  }

  if (result.mode === 'applied') {
    console.log(added('✓') + ` rollback queued`)
    console.log(dim(`  new live=${result.deploymentId}  ← artifact from ${result.rolledBackToDeploymentId}`))
    return
  }

  if (result.candidates.length === 0) {
    console.log(dim('No rollback candidates available.'))
    return
  }

  console.log(
    table(
      ['DEPLOYMENT', 'VERSION', 'SHA', 'DEPLOYED AT'],
      result.candidates.map((c: RollbackCandidate) => [
        c.deploymentId,
        `v${c.versionMajor}.${c.versionMinor}.${c.versionPatch}`,
        c.gitSha ? c.gitSha.slice(0, 8) : '—',
        c.deployedAt ?? '—',
      ])
    )
  )
}

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
    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })

    if (list || !target) {
      const result = await rpc.invoke('rollbackDeployment', {
        projectId: ctx.projectId,
      })
      return { mode: 'list', candidates: result.candidates }
    }

    if (dryRun) {
      return { mode: 'dry-run', target, candidates: [] }
    }

    const result = await rpc.invoke('rollbackDeployment', {
      projectId: ctx.projectId,
      target,
    })
    return {
      mode: 'applied',
      deploymentId: result.deploymentId,
      rolledBackToDeploymentId: result.rolledBackToDeploymentId,
      candidates: result.candidates,
    }
  },
})
