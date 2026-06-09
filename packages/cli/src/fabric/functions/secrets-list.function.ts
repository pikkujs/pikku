import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { dim } from '../lib/output.js'

export const FabricSecretsListInput = z.object({
  branch: z.string(),
})

export const FabricSecretsListOutput = z.object({
  branch: z.string(),
  names: z.array(z.string()),
})

export const renderSecretsList = (
  _s: unknown,
  { branch, names }: z.infer<typeof FabricSecretsListOutput>
): void => {
  if (names.length === 0) {
    console.log(dim(`No secrets set on ${branch}.`))
    return
  }
  for (const name of names) console.log(name)
}

export const FabricSecretsList = pikkuSessionlessFunc({
  description:
    'List secret names visible to a stage (values never leave the server).',
  input: FabricSecretsListInput,
  output: FabricSecretsListOutput,
  func: async (_services, { branch }) => {
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
    return { branch, names: result.names }
  },
})
