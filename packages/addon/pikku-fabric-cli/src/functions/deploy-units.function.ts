import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { resolveStageId } from '../lib/stage.js'
import { table, statusColor, dim } from '@pikku/cli/addon-support'
import { PreconditionError } from '@pikku/cli/addon-support'

export const FabricDeployUnitsInput = z.object({
  branch: z.string().default('main'),
})

export const FabricDeployUnitsOutput = z.object({
  branch: z.string(),
  workers: z.array(z.any()),
})

export const FabricDeployUnits = pikkuSessionlessFunc({
  description: 'List the deployed worker units (topology) for a branch',
  input: FabricDeployUnitsInput,
  output: FabricDeployUnitsOutput,
  func: async (_services, { branch }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new PreconditionError(
        'Not logged in. Run `pikku fabric login` first.'
      )
    if (!ctx.projectId)
      throw new PreconditionError(
        'No fabric project linked. Run `pikku fabric link` first.'
      )

    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const stageId = await resolveStageId(rpc, ctx.projectId, branch)
    const { workers } = await rpc.invoke('listDeploymentWorkers', { stageId })
    return { branch, workers }
  },
})

type WorkerRow = {
  name: string
  role: string
  status: string
  functionIds: string[]
}

export const renderDeployUnits = (
  _s: unknown,
  { branch, workers }: { branch: string; workers: WorkerRow[] }
): void => {
  if (workers.length === 0) {
    console.log(dim(`No deployed units for ${branch}.`))
    return
  }
  console.log(
    table(
      ['WORKER', 'ROLE', 'STATUS', 'FUNCTIONS'],
      workers.map((w) => [
        w.name,
        w.role,
        statusColor(w.status),
        w.functionIds.length,
      ])
    )
  )
}
