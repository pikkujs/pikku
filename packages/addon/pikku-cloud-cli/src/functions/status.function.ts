import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'
import { resolveApiContext } from '../lib/config.js'
import { getCloudRPC } from '../lib/http.js'
import { autoDeployOffHints } from '../lib/stage.js'
import { keyValue, statusColor, dim } from '@pikku/cli/addon-support'
import { PreconditionError } from '@pikku/cli/addon-support'

export const CloudStatusInput = z.object({})

export const CloudStatusOutput = z.object({
  projectId: z.string(),
  status: z.any(),
  hints: z.array(z.string()),
})

export const CloudStatus = pikkuSessionlessFunc({
  description: 'Show the linked project status (active + in-flight deployment)',
  input: CloudStatusInput,
  output: CloudStatusOutput,
  func: async (_services) => {
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
    const status = await rpc.invoke('getProjectStatus', {
      projectId: ctx.projectId,
    })
    const hints = status.exists
      ? await autoDeployOffHints(rpc, ctx.projectId)
      : []
    return { projectId: ctx.projectId, status, hints }
  },
})

type StageState = {
  stageBranch: string
  gitSha?: string | null
  status: string
  url?: string | null
}
type ProjectStatus = {
  exists: boolean
  projectName?: string | null
  active?: StageState | null
  deploying?: StageState | null
  mcpUrl?: string | null
}

const stageLine = (s: StageState): string =>
  `${s.stageBranch} @ ${(s.gitSha ?? '').slice(0, 7)} · ${statusColor(s.status)}${
    s.url ? ` · ${s.url}` : ''
  }`

export const renderStatus = (
  _s: unknown,
  {
    projectId,
    status,
    hints,
  }: { projectId: string; status: ProjectStatus; hints: string[] }
): void => {
  if (!status.exists) {
    console.log(dim('Project not found or no access.'))
    return
  }
  const rows: [string, string][] = [
    ['project', status.projectName ?? projectId],
    ['active', status.active ? stageLine(status.active) : dim('(none)')],
  ]
  if (status.deploying) rows.push(['deploying', stageLine(status.deploying)])
  if (status.mcpUrl) rows.push(['mcp', status.mcpUrl])
  console.log(keyValue(rows))
  for (const hint of hints) console.log(dim(hint))
}
