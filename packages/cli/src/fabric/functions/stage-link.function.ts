import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { resolveStage } from '../lib/stage.js'
import { FabricPreconditionError } from '../lib/errors.js'

export const FabricStageLinkInput = z.object({
  kind: z.enum(['access', 'changes']),
  branch: z.string().optional(),
  route: z.string().optional(),
})

export const FabricStageLinkOutput = z.object({
  branch: z.string(),
  kind: z.enum(['access', 'changes']),
  url: z.string(),
  expiresAt: z.string(),
  needsDeploy: z.boolean(),
})

export const FabricStageLink = pikkuSessionlessFunc({
  description:
    'Print the link that opens a private stage: `access` to use it, `changes` to use it with the changes panel. Turns the panel on when asked for a changes link.',
  input: FabricStageLinkInput,
  output: FabricStageLinkOutput,
  func: async (_services, { kind, branch: requested, route }) => {
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

    let needsDeploy = false
    if (kind === 'changes') {
      const changes = await rpc.invoke('configureStageChanges', {
        stageId,
        enabled: true,
      })
      needsDeploy = changes.needsDeploy
    }

    const link = await rpc.invoke('createStageLink', { stageId, kind, route })
    const expiresAt = new Date(link.expiresAt).toISOString()
    return { branch, kind, url: link.url, expiresAt, needsDeploy }
  },
})

export const renderStageLink = (
  _s: unknown,
  {
    branch,
    kind,
    url,
    expiresAt,
    needsDeploy,
  }: z.infer<typeof FabricStageLinkOutput>
): void => {
  console.log(url)
  console.error(`[fabric] ${kind} link for ${branch}, expires ${expiresAt}`)
  if (needsDeploy)
    console.error(
      `[fabric] the changes panel shows after the next deploy of ${branch}`
    )
}
