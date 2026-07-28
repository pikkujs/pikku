import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { resolveStageId } from '../lib/stage.js'

export const FabricSecretsListInput = z.object({
  branch: z.string(),
  json: z.boolean().optional(),
})

export const FabricSecretsListOutput = z.object({
  secrets: z.array(z.object({ name: z.string(), updatedAt: z.string() })),
})

export const FabricSecretsList = pikkuSessionlessFunc({
  description:
    'List the secrets set on a stage, by name. Values are sealed to the stage and never leave it.',
  input: FabricSecretsListInput,
  output: FabricSecretsListOutput,
  func: async (_services, { branch, json }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new Error('Not logged in. Run `pikku fabric login` first.')
    if (!ctx.projectId)
      throw new Error(
        'No fabric project linked. Run `pikku fabric link` first.'
      )

    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const stageId = await resolveStageId(rpc, ctx.projectId, branch)
    const result = await rpc.invoke('listStageSecretNames', { stageId })

    if (json) {
      console.log(JSON.stringify({ branch, secrets: result.secrets }, null, 2))
    } else if (result.secrets.length === 0) {
      console.log(`[fabric] no secrets set on ${branch}`)
    } else {
      for (const { name, updatedAt } of result.secrets) {
        console.log(`${name}\t${updatedAt}`)
      }
    }
    return result
  },
})
