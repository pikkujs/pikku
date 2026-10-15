import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { getCloudRPC } from '../lib/http.js'
import { resolveStage } from '../lib/stage.js'
import { CloudPreconditionError } from '../../utils/precondition-error.js'

export const CloudVariablesGetInput = z.object({
  name: z.string(),
  branch: z.string().optional(),
  json: z.boolean().optional(),
})

export const CloudVariablesGetOutput = z.object({
  name: z.string(),
  exists: z.boolean(),
  value: z.unknown(),
})

export const CloudVariablesGet = pikkuSessionlessFunc({
  description:
    'Read a stage-scoped variable back, so you can see the shape it was stored in rather than the shape you meant.',
  input: CloudVariablesGetInput,
  output: CloudVariablesGetOutput,
  func: async (_services, { name, branch: requested, json }) => {
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
    const { exists, value } = await rpc.invoke('getStageConsoleVariable', {
      stageId,
      variableId: name,
    })

    if (json) {
      console.log(JSON.stringify({ branch, name, exists, value }, null, 2))
    } else if (!exists) {
      console.log(`[cloud] ${name} is not set on ${branch}`)
    } else {
      // `JSON.stringify` rather than the bare value, because the shape is the
      // thing worth seeing: `true` and `"true"` print identically otherwise, and
      // telling them apart is usually why you are looking.
      console.log(JSON.stringify(value))
    }

    return { name, exists, value }
  },
})
