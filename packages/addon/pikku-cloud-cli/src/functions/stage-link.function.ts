import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { resolveApiContext } from '../lib/config.js'
import { getCloudRPC } from '../lib/http.js'
import { resolveStage } from '../lib/stage.js'
import { PreconditionError } from '@pikku/cli/addon-support'

export const CloudStageLinkInput = z.object({
  kind: z.enum(['access', 'changes']),
  branch: z.string().optional(),
  route: z.string().optional(),
})

export const CloudStageLinkOutput = z.object({
  branch: z.string(),
  kind: z.enum(['access', 'changes']),
  url: z.string(),
  expiresAt: z.string(),
  needsDeploy: z.boolean(),
})

export const CloudStageLink = pikkuSessionlessFunc({
  description:
    'Print the link that opens a private stage: `access` to use it, `changes` to use it with the changes panel. Turns the panel on when asked for a changes link.',
  input: CloudStageLinkInput,
  output: CloudStageLinkOutput,
  func: async (_services, { kind, branch: requested, route }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new PreconditionError(
        'Not logged in. Run `pikku cloud login` first.'
      )
    if (!ctx.projectId)
      throw new PreconditionError(
        'No cloud project linked. Run `pikku cloud link` first.'
      )

    const rpc = getCloudRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
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
  }: z.infer<typeof CloudStageLinkOutput>
): void => {
  console.log(url)
  console.error(`[cloud] ${kind} link for ${branch}, expires ${expiresAt}`)
  if (needsDeploy)
    console.error(
      `[cloud] the changes panel shows after the next deploy of ${branch}`
    )
}
