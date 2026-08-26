import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { resolveStage } from '../lib/stage.js'

export const FabricSecretsRotateInput = z.object({
  branch: z.string().optional(),
  force: z.boolean().optional(),
})

export const FabricSecretsRotateOutput = z.object({
  retiredKeyId: z.string().nullable(),
})

export const FabricSecretsRotate = pikkuSessionlessFunc({
  description:
    "Retire a stage's sealing key so the next deploy issues a new one. Secrets sealed to the old key must be set again.",
  input: FabricSecretsRotateInput,
  output: FabricSecretsRotateOutput,
  func: async (_services, { branch: requested, force }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new Error('Not logged in. Run `pikku fabric login` first.')
    if (!ctx.projectId)
      throw new Error(
        'No fabric project linked. Run `pikku fabric link` first.'
      )

    // Resolved before the refusal, so the one message standing between a
    // typo and unreadable secrets names the stage that would actually be
    // rotated rather than echoing an argument that may not have been passed.
    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const { stageId, branch } = await resolveStage(
      rpc,
      ctx.projectId,
      requested
    )

    if (!force) {
      // Not a confirmation for politeness — this is the one operation here
      // that destroys access to data. Fabric cannot read the sealed values, so
      // it cannot carry them over, and nobody can undo it afterwards.
      throw new Error(
        `Rotating the sealing key on ${branch} makes every secret already set on it unreadable — fabric cannot re-seal values it cannot open, so each one must be set again after the next deploy. Re-run with --force if that is what you want.`
      )
    }

    const result = await rpc.invoke('rotateStageSealingKey', { stageId })

    console.log(
      `[fabric] retired sealing key ${result.retiredKeyId} on ${branch}`
    )
    console.log(
      '[fabric] deploy the stage to issue a new key, then set its secrets again'
    )
    return { retiredKeyId: result.retiredKeyId }
  },
})
