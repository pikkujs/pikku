import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { getCloudRPC } from '../lib/http.js'
import { resolveStage } from '../lib/stage.js'
import { CloudPreconditionError } from '../../utils/precondition-error.js'

export const CloudSecretsRotateInput = z.object({
  branch: z.string().optional(),
  force: z.boolean().optional(),
})

export const CloudSecretsRotateOutput = z.object({
  retiredKeyId: z.string().nullable(),
})

export const CloudSecretsRotate = pikkuSessionlessFunc({
  description:
    "Retire a stage's sealing key so the next deploy issues a new one. Secrets sealed to the old key must be set again.",
  input: CloudSecretsRotateInput,
  output: CloudSecretsRotateOutput,
  func: async (_services, { branch: requested, force }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new CloudPreconditionError(
        'Not logged in. Run `pikku cloud login` first.'
      )
    if (!ctx.projectId)
      throw new CloudPreconditionError(
        'No cloud project linked. Run `pikku cloud link` first.'
      )

    // Resolved before the refusal, so the one message standing between a
    // typo and unreadable secrets names the stage that would actually be
    // rotated rather than echoing an argument that may not have been passed.
    const rpc = getCloudRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const { stageId, branch } = await resolveStage(
      rpc,
      ctx.projectId,
      requested
    )

    if (!force) {
      // Not a confirmation for politeness — this is the one operation here
      // that destroys access to data. Pikku Studio Cloud cannot read the sealed values, so
      // it cannot carry them over, and nobody can undo it afterwards.
      throw new CloudPreconditionError(
        `Rotating the sealing key on ${branch} makes every secret already set on it unreadable — cloud cannot re-seal values it cannot open, so each one must be set again after the next deploy. Re-run with --force if that is what you want.`
      )
    }

    const result = await rpc.invoke('rotateStageSealingKey', { stageId })

    console.log(
      `[cloud] retired sealing key ${result.retiredKeyId} on ${branch}`
    )
    console.log(
      '[cloud] deploy the stage to issue a new key, then set its secrets again'
    )
    return { retiredKeyId: result.retiredKeyId }
  },
})
