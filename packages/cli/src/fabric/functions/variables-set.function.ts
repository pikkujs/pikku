import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { resolveStage } from '../lib/stage.js'
import { parseVariableValue } from '../lib/variable-value.js'

export const FabricVariablesSetInput = z.object({
  name: z.string(),
  branch: z.string().optional(),
  value: z.string(),
})

export const FabricVariablesSetOutput = z.object({
  name: z.string(),
  success: z.boolean(),
})

export const FabricVariablesSet = pikkuSessionlessFunc({
  description:
    'Set a stage-scoped variable — the deployed counterpart of a line in .env. Not a secret: the value is stored in plain form and is readable back.',
  input: FabricVariablesSetInput,
  output: FabricVariablesSetOutput,
  func: async (_services, { name, branch: requested, value }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new Error('Not logged in. Run `pikku fabric login` first.')
    if (!ctx.projectId)
      throw new Error(
        'No fabric project linked. Run `pikku fabric link` first.'
      )

    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const { stageId, branch } = await resolveStage(
      rpc,
      ctx.projectId,
      requested
    )

    // Deliberately not sealed, and deliberately not prompted for. A variable is
    // configuration — a port, a URL, a feature switch — and treating it like a
    // secret would mean it could not be read back, which is most of the value of
    // having it separate from `secrets` in the first place. Anything that would
    // hurt to print belongs in `pikku fabric secrets set`.
    const { success } = await rpc.invoke('setStageConsoleVariable', {
      stageId,
      variableId: name,
      value: parseVariableValue(value),
    })

    console.log(`[fabric] ${name} set on ${branch}.`)
    return { name, success }
  },
})
