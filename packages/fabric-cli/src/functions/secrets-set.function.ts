import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'
import { resolveApiContext } from '../lib/config.js'
import { getRpc } from '../lib/http.js'
import { promptSecret } from '../lib/prompt.js'

export const FabricSecretsSetInput = z.object({
  name: z.string(),
  stage: z.enum(['preview', 'production']),
  value: z.string().optional(),
  force: z.boolean().optional(),
})

export const FabricSecretsSetOutput = z.object({ ok: z.boolean() })

export const FabricSecretsSet = pikkuSessionlessFunc({
  description:
    'Set a stage-scoped secret. Encrypted with the stage KEK and stored in the project D1.',
  input: FabricSecretsSetInput,
  output: FabricSecretsSetOutput,
  func: async (_services, { name, stage, value }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new Error('Not logged in. Run `pikku fabric login` first.')
    if (!ctx.projectId)
      throw new Error(
        'No fabric project linked. Run `pikku fabric link` first.'
      )

    const plaintext = value ?? (await promptSecret(`${name} value`))
    if (!plaintext) throw new Error('Empty secret value — aborting.')

    const rpc = getRpc({ apiUrl: ctx.apiUrl, token: ctx.token })
    const result = await rpc.invoke('setStageSecret', {
      projectId: ctx.projectId,
      kind: stage,
      name,
      value: plaintext,
    })
    console.log(`[fabric] ${name} set on ${stage}.`)
    return result
  },
})
