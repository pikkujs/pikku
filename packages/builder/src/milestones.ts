import { functionsDirFor, gherkinOf, planShortfall, readMilestones, readPikkuMeta, readPlan, type PlanChecklistItem } from '@pikku/knowledge'
import { readChecks, type MilestoneCheck } from './loop.js'

export interface MilestoneReport {
  path: string
  title: string
  description: string | null
  status: 'proposed' | 'dispatched' | 'built'
  statusAt: string | null
  gherkin: string | null
  plan: { items: PlanChecklistItem[]; problems: string[] } | null
  check: MilestoneCheck | null
}

const STATUSES = ['proposed', 'dispatched', 'built'] as const

export async function milestoneReport(cwd: string): Promise<MilestoneReport[]> {
  const notes = (await readMilestones(cwd)).sort((a, b) => a.path.localeCompare(b.path))
  const checks = readChecks(cwd)
  let meta: ReturnType<typeof readPikkuMeta> | null = null
  try {
    meta = readPikkuMeta(functionsDirFor(cwd))
  } catch {}
  return notes.map((note) => {
    const read = readPlan(cwd, note.path)
    let plan: MilestoneReport['plan'] = null
    if (read.ok && meta) {
      const shortfall = planShortfall(read.plan, meta)
      plan = { items: shortfall.items, problems: shortfall.problems }
    }
    return {
      path: note.path,
      title: note.title ?? note.path,
      description: note.description ?? null,
      status: STATUSES.find((status) => status === note.status) ?? 'proposed',
      statusAt: note.statusAt ?? null,
      gherkin: gherkinOf(note),
      plan,
      check: checks[note.path] ?? null,
    }
  })
}
