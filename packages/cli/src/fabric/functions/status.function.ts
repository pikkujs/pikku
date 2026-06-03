import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { keyValue, statusColor, dim } from '../lib/output.js'

export const FabricStatusInput = z.object({})

export const FabricStatusOutput = z.object({
  projectId: z.string(),
  status: z.any(),
})

export const FabricStatus = pikkuSessionlessFunc({
  description: 'Show the linked project status (active + in-flight deployment)',
  input: FabricStatusInput,
  output: FabricStatusOutput,
  func: async (_services) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new Error('Not logged in. Run `pikku fabric login` first.')
    if (!ctx.projectId)
      throw new Error(
        'No fabric project linked. Run `pikku fabric link` first.'
      )

    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const status = await rpc.invoke('getProjectStatus', {
      projectId: ctx.projectId,
    })
    return { projectId: ctx.projectId, status }
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
  { projectId, status }: { projectId: string; status: ProjectStatus }
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
}
