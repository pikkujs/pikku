import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { resolveStageId } from '../lib/stage.js'

export const FabricSecretsRotateInput = z.object({
  branch: z.string(),
  force: z.boolean().optional(),
})

export const FabricSecretsRotateOutput = z.object({
  retiredKeyId: z.string(),
})

export const FabricSecretsRotate = pikkuSessionlessFunc({
  description:
    "Retire a stage's sealing key so the next deploy issues a new one. Secrets sealed to the old key must be set again.",
  input: FabricSecretsRotateInput,
  output: FabricSecretsRotateOutput,
  func: async (_services, { branch, force }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new Error('Not logged in. Run `pikku fabric login` first.')
    if (!ctx.projectId)
      throw new Error(
        'No fabric project linked. Run `pikku fabric link` first.'
      )

    if (!force) {
      // Not a confirmation for politeness — this is the one operation here
      // that destroys access to data. Fabric cannot read the sealed values, so
      // it cannot carry them over, and nobody can undo it afterwards.
      throw new Error(
        `Rotating the sealing key on ${branch} makes every secret already set on it unreadable — fabric cannot re-seal values it cannot open, so each one must be set again after the next deploy. Re-run with --force if that is what you want.`
      )
    }

    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const stageId = await resolveStageId(rpc, ctx.projectId, branch)
    const result = await rpc.invoke('rotateStageSealingKey', { stageId })

    console.log(
      `[fabric] retired sealing key ${result.retiredKeyId} on ${branch}`
    )
    console.log(
      '[fabric] deploy the stage to issue a new key, then set its secrets again'
    )
    return result
  },
})
