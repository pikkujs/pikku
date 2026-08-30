import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { readSpool } from '../lib/finding-spool.js'
import { dim, table } from '../lib/output.js'

export const FabricFindingsListInput = z.object({})

export const FabricFindingsListOutput = z.object({
  findings: z.array(
    z.object({
      title: z.string(),
      kind: z.string(),
      reason: z.string(),
      reportedAt: z.string(),
      projectId: z.string().nullable(),
      file: z.string(),
    })
  ),
})

/**
 * What is waiting to be sent. Without this the spool is invisible, and an
 * agent has no way to tell a finding that reached fabric from one still
 * sitting on the machine.
 */
export const FabricFindingsList = pikkuSessionlessFunc({
  description: 'List the findings queued locally, waiting to be sent.',
  input: FabricFindingsListInput,
  output: FabricFindingsListOutput,
  func: async () => ({
    findings: (await readSpool()).map((entry) => ({
      title: entry.payload.title,
      kind: entry.payload.kind,
      reason: entry.reason,
      reportedAt: entry.payload.reportedAt,
      projectId: entry.projectId,
      file: entry.file,
    })),
  }),
})

type QueuedFinding = {
  title: string
  kind: string
  reason: string
  reportedAt: string
}

export const renderFindingsList = (
  _s: unknown,
  { findings }: { findings: QueuedFinding[] }
): void => {
  console.log('')
  if (findings.length === 0) {
    console.log(dim('  Nothing queued — every finding you filed was sent.'))
    console.log('')
    return
  }
  console.log(
    table(
      ['REPORTED', 'KIND', 'HELD BECAUSE', 'TITLE'],
      findings.map((f) => [
        f.reportedAt.slice(0, 16).replace('T', ' '),
        f.kind,
        f.reason,
        f.title,
      ])
    )
  )
  console.log('')
  console.log(dim('  `pikku fabric findings flush` sends them.'))
  console.log('')
}
