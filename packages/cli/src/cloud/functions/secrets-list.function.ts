import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { getCloudRPC } from '../lib/http.js'
import { resolveStage } from '../lib/stage.js'
import { CloudPreconditionError } from '../lib/errors.js'

export const CloudSecretsListInput = z.object({
  branch: z.string().optional(),
  json: z.boolean().optional(),
})

export const CloudSecretsListOutput = z.object({
  secrets: z.array(z.object({ name: z.string(), updatedAt: z.string() })),
})

export const CloudSecretsList = pikkuSessionlessFunc({
  description:
    'List the secrets set on a stage, by name. Values are sealed to the stage and never leave it.',
  input: CloudSecretsListInput,
  output: CloudSecretsListOutput,
  func: async (_services, { branch: requested, json }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new CloudPreconditionError(
        'Not logged in. Run `pikku cloud login` first.'
      )
    if (!ctx.projectId)
      throw new CloudPreconditionError(
        'No cloud project linked. Run `pikku cloud link` first.'
      )

    const rpc = getCloudRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const { stageId, branch } = await resolveStage(
      rpc,
      ctx.projectId,
      requested
    )
    const result = await rpc.invoke('listStageSecretNames', { stageId })

    if (json) {
      console.log(JSON.stringify({ branch, secrets: result.secrets }, null, 2))
    } else if (result.secrets.length === 0) {
      console.log(`[cloud] no secrets set on ${branch}`)
    } else {
      for (const { name, updatedAt } of result.secrets) {
        console.log(`${name}\t${updatedAt}`)
      }
    }
    return result
  },
})
