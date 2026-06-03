import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'

export const FabricSecretsListInput = z.object({
  branch: z.string(),
  json: z.boolean().optional(),
})

export const FabricSecretsListOutput = z.object({ names: z.array(z.string()) })

export const FabricSecretsList = pikkuSessionlessFunc({
  description:
    'List secret names visible to a stage (values never leave the server).',
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
    const result = await rpc.invoke('listStageSecrets', {
      projectId: ctx.projectId,
      branch,
    })
    if (json) {
      console.log(JSON.stringify({ branch, names: result.names }, null, 2))
    } else if (result.names.length === 0) {
      console.log(`[fabric] no secrets set on ${branch}`)
    } else {
      for (const name of result.names) console.log(name)
    }
    return result
  },
})
