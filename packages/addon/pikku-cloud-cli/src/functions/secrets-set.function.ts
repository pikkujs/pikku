import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { resolveApiContext } from '../lib/config.js'
import { getCloudRPC } from '../lib/http.js'
import { CloudPreconditionError } from '@pikku/cli/addon-support'
import { promptSecret } from '../lib/prompt.js'
import { resolveStage } from '../lib/stage.js'
import { seal } from '@pikku/keys'

export const CloudSecretsSetInput = z.object({
  name: z.string(),
  branch: z.string().optional(),
  value: z.string().optional(),
  force: z.boolean().optional(),
})

export const CloudSecretsSetOutput = z.object({
  name: z.string(),
  keyId: z.string(),
})

export const CloudSecretsSet = pikkuSessionlessFunc({
  description:
    'Set a stage-scoped secret. Sealed here to the stage public key — the plaintext never leaves this machine.',
  input: CloudSecretsSetInput,
  output: CloudSecretsSetOutput,
  func: async (_services, { name, branch: requested, value }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new CloudPreconditionError(
        'Not logged in. Run `pikku cloud login` first.'
      )
    if (!ctx.projectId)
      throw new CloudPreconditionError(
        'No cloud project linked. Run `pikku cloud link` first.'
      )

    // A value on the command line wins; otherwise the prompt, which reads
    // piped stdin when there is no tty rather than waiting for a human who is
    // not there. Both paths are scriptable, so neither can hang a CI job.
    const plaintext =
      value ??
      (await promptSecret(`${name} value`, {
        nonInteractiveHint: `Pass the value with \`--value\`, or pipe it: \`echo '<value>' | pikku cloud secrets set ${name}\`.`,
      }))
    if (!plaintext)
      throw new CloudPreconditionError('Empty secret value — aborting.')

    const rpc = getCloudRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const { stageId, branch } = await resolveStage(
      rpc,
      ctx.projectId,
      requested
    )

    // Pikku Studio Cloud holds only the public half of this keypair. The private half went
    // to the stage's worker at deploy time and was dropped there, so the value
    // sealed below can be opened by that worker and by nothing else — including
    // by the cloud process that stores it.
    const key = await rpc.invoke('cloud:getStageSealingKey', { stageId })
    let sealed
    try {
      sealed = await seal(key.publicKey, key.keyId, plaintext)
    } catch {
      // A key that is not a usable X25519 key: most likely a newer stage key type.
      throw new CloudPreconditionError(
        'The stage sealing key is not an X25519 public key this CLI can use. It may be a newer key type: run `npm i -g @pikku/cli`.'
      )
    }

    const result = await rpc.invoke('cloud:setStageSealedSecret', {
      stageId,
      name,
      sealedValue: JSON.stringify(sealed),
    })
    console.log(
      `[cloud] ${name} sealed to ${result.keyId} and set on ${branch}.`
    )
    return result
  },
})
