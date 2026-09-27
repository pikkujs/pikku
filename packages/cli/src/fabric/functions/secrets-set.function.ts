import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { FabricPreconditionError } from '../lib/errors.js'
import { promptSecret } from '../lib/prompt.js'
import { resolveStage } from '../lib/stage.js'
import { seal, serializeSealedValue } from '../lib/sealed-box.js'

export const FabricSecretsSetInput = z.object({
  name: z.string(),
  branch: z.string().optional(),
  value: z.string().optional(),
  force: z.boolean().optional(),
})

export const FabricSecretsSetOutput = z.object({
  name: z.string(),
  keyId: z.string(),
})

export const FabricSecretsSet = pikkuSessionlessFunc({
  description:
    'Set a stage-scoped secret. Sealed here to the stage public key — the plaintext never leaves this machine.',
  input: FabricSecretsSetInput,
  output: FabricSecretsSetOutput,
  func: async (_services, { name, branch: requested, value }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new FabricPreconditionError(
        'Not logged in. Run `pikku fabric login` first.'
      )
    if (!ctx.projectId)
      throw new FabricPreconditionError(
        'No fabric project linked. Run `pikku fabric link` first.'
      )

    // A value on the command line wins; otherwise the prompt, which reads
    // piped stdin when there is no tty rather than waiting for a human who is
    // not there. Both paths are scriptable, so neither can hang a CI job.
    const plaintext =
      value ??
      (await promptSecret(`${name} value`, {
        nonInteractiveHint: `Pass the value with \`--value\`, or pipe it: \`echo '<value>' | pikku fabric secrets set ${name}\`.`,
      }))
    if (!plaintext)
      throw new FabricPreconditionError('Empty secret value — aborting.')

    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const { stageId, branch } = await resolveStage(
      rpc,
      ctx.projectId,
      requested
    )

    // Fabric holds only the public half of this keypair. The private half went
    // to the stage's worker at deploy time and was dropped there, so the value
    // sealed below can be opened by that worker and by nothing else — including
    // by the fabric process that stores it.
    const key = await rpc.invoke('getStageSealingKey', { stageId })
    const sealed = seal(key.publicKey, key.keyId, plaintext)

    const result = await rpc.invoke('setStageSealedSecret', {
      stageId,
      name,
      sealedValue: serializeSealedValue(sealed),
    })
    console.log(
      `[fabric] ${name} sealed to ${result.keyId} and set on ${branch}.`
    )
    return result
  },
})
