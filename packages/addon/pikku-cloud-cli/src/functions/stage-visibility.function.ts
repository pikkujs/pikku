import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { resolveApiContext } from '../lib/config.js'
import { getCloudRPC } from '../lib/http.js'
import { resolveStage } from '../lib/stage.js'
import { CloudPreconditionError } from '@pikku/cli/addon-support'

export const CloudStageVisibilityInput = z.object({
  visibility: z.enum(['public', 'private']),
  branch: z.string().optional(),
})

export const CloudStageVisibilityOutput = z.object({
  branch: z.string(),
  isPublic: z.boolean(),
  live: z.boolean(),
})

export const CloudStageVisibility = pikkuSessionlessFunc({
  description:
    'Make a stage public, so anyone with its URL can open it, or private, so only a link from `pikku cloud stage link` does.',
  input: CloudStageVisibilityInput,
  output: CloudStageVisibilityOutput,
  func: async (_services, { visibility, branch: requested }) => {
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
    const { isPublic, live } = await rpc.invoke('setStageVisibility', {
      stageId,
      isPublic: visibility === 'public',
    })
    return { branch, isPublic, live }
  },
})

export const renderStageVisibility = (
  _s: unknown,
  { branch, isPublic, live }: z.infer<typeof CloudStageVisibilityOutput>
): void => {
  console.log(
    `[cloud] ${branch} is ${isPublic ? 'public' : 'private'}${live ? '' : ' (applies on the next deploy)'}`
  )
}
