import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { resolveStage } from '../lib/stage.js'
import { FabricPreconditionError } from '../lib/errors.js'

export const FabricStageVisibilityInput = z.object({
  visibility: z.enum(['public', 'private']),
  branch: z.string().optional(),
})

export const FabricStageVisibilityOutput = z.object({
  branch: z.string(),
  isPublic: z.boolean(),
  live: z.boolean(),
})

export const FabricStageVisibility = pikkuSessionlessFunc({
  description:
    'Make a stage public, so anyone with its URL can open it, or private, so only a link from `pikku fabric stage link` does.',
  input: FabricStageVisibilityInput,
  output: FabricStageVisibilityOutput,
  func: async (_services, { visibility, branch: requested }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new FabricPreconditionError(
        'Not logged in. Run `pikku fabric login` first.'
      )
    if (!ctx.projectId)
      throw new FabricPreconditionError(
        'No fabric project linked. Run `pikku fabric link` first.'
      )

    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const { stageId, branch } = await resolveStage(
      rpc,
      ctx.projectId,
      requested
    )
    const { isPublic, live } = await rpc.invoke('setStageVisibility', {
      stageId,
      isPublic: visibility === 'public',
    })
    return { branch, isPublic, live }
  },
})

export const renderStageVisibility = (
  _s: unknown,
  { branch, isPublic, live }: z.infer<typeof FabricStageVisibilityOutput>
): void => {
  console.log(
    `[fabric] ${branch} is ${isPublic ? 'public' : 'private'}${live ? '' : ' (applies on the next deploy)'}`
  )
}
