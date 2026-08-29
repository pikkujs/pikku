import { z } from 'zod'
import type { ReportEnvironment } from './report-environment.js'

export const FindingInput = z.object({
  title: z.string(),
  kind: z.enum(['product', 'harness']),
  model: z.string(),
  expected: z.string(),
  actual: z.string(),
  skill: z.string().optional(),
  passage: z.string().optional(),
  command: z.string().optional(),
  error: z.string().optional(),
  repro: z.string().optional(),
  workaround: z.string().optional(),
  proposal: z.string().optional(),
  tried: z.string().optional(),
  unresolved: z.boolean().optional(),
  area: z.string().optional(),
  surface: z.enum(['local', 'deployed', 'both']).optional(),
  cost: z.string().optional(),
  run: z.string().optional(),
  deployTarget: z.string().optional(),
})

export type FindingInput = z.infer<typeof FindingInput>

export type ParsedFinding =
  | { finding: FindingInput }
  | { problems: string[] }

/** Shape-check a finding from either path, naming every field that is wrong. */
export function parseFinding(value: unknown): ParsedFinding {
  const result = FindingInput.safeParse(value)
  if (result.success) return { finding: result.data }
  return {
    problems: result.error.issues.map(
      (issue) => `${issue.path.join('.') || 'finding'}: ${issue.message}`
    ),
  }
}

/**
 * A finding read as JSON rather than assembled out of flags.
 *
 * Half the fields are prose, and prose carries apostrophes, quotes, backticks
 * and newlines — every one of them a shell metacharacter before it is a
 * character in a sentence. An error message pasted into `--error` breaks the
 * command at its first newline; one carrying a backtick runs whatever follows
 * it. JSON has its own escaping, so this path has none of that.
 *
 * Returns the finding or the problems with it, never throws: a malformed
 * payload is a usage mistake worth naming precisely.
 */
export function parseFindingJson(raw: string): ParsedFinding {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error: any) {
    return {
      problems: [`--stdin expected a JSON object (${error.message}).`],
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { problems: ['--stdin expected a JSON object.'] }
  }
  return parseFinding(parsed)
}

export interface FindingPayload extends Omit<FindingInput, 'run'> {
  runId?: string
  environment: ReportEnvironment
  reportedAt: string
}

/**
 * The rules the field set exists to enforce, checked before anything is sent.
 *
 * A usage mistake is the agent's own and is worth failing loudly for — unlike a
 * failed send, which must never surface as a build failure. Every problem is
 * returned at once so a malformed call is fixed in one pass.
 */
export function validateFinding(input: FindingInput): string[] {
  const problems: string[] = []
  if (input.kind === 'harness' && !input.skill) {
    problems.push(
      'A harness finding names the skill that misled you — pass --skill (and --passage for the line it contradicts).'
    )
  }
  if (input.unresolved) {
    if (!input.tried) {
      problems.push(
        'An unresolved finding carries what you tried and how each attempt failed — pass --tried.'
      )
    }
    if (input.workaround) {
      problems.push(
        'Unresolved means no workaround was found. Drop --unresolved, or drop --workaround.'
      )
    }
  } else if (!input.workaround && !input.proposal) {
    problems.push(
      'A resolved finding carries the workaround you used — pass --workaround, or --unresolved if there was none.'
    )
  }
  return problems
}

export function buildFindingPayload(
  input: FindingInput,
  environment: ReportEnvironment,
  now: Date = new Date()
): FindingPayload {
  const { run, ...rest } = input
  return { ...rest, runId: run, environment, reportedAt: now.toISOString() }
}

/**
 * Best-effort by construction. A finding is worth having and never worth
 * failing a build for, so a refused, slow or unreachable endpoint is reported
 * to the terminal and swallowed.
 */
export async function postFinding(opts: {
  apiUrl: string
  token: string
  /**
   * Provenance, not a routing key. A finding is about the framework rather
   * than about anyone's project, and the reports worth having most — a
   * scaffold that never produced a config, a first run that went wrong — come
   * from checkouts that have no project to name.
   */
  projectId: string | null
  payload: FindingPayload
  timeoutMs?: number
}): Promise<{ sent: boolean; reason?: string }> {
  try {
    const response = await fetch(`${opts.apiUrl}/findings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${opts.token}`,
      },
      body: JSON.stringify({
        projectId: opts.projectId,
        finding: opts.payload,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    })
    if (!response.ok) {
      return { sent: false, reason: `fabric answered ${response.status}` }
    }
    return { sent: true }
  } catch (error: any) {
    return { sent: false, reason: error?.message ?? 'request failed' }
  }
}

/**
 * The receipt. Nothing is written to disk, so the terminal is the only place
 * the user sees what left their machine. Printed before the request goes out,
 * so it is there whether or not the send succeeds.
 */
export function renderReceipt(payload: FindingPayload): string {
  const lines: string[] = [`[fabric] reporting: ${payload.title}`]
  const field = (label: string, value?: string) => {
    if (value) lines.push(`  ${label}: ${value}`)
  }
  field(
    'kind',
    payload.unresolved ? `${payload.kind} (unresolved)` : payload.kind
  )
  field('area', payload.area)
  field(
    'skill',
    payload.passage ? `${payload.skill} — ${payload.passage}` : payload.skill
  )
  field('command', payload.command)
  field('expected', payload.expected)
  field('actual', payload.actual)
  field('error', payload.error)
  field('surface', payload.surface)
  field('cost', payload.cost)
  field('repro', payload.repro)
  field('workaround', payload.workaround)
  field('tried', payload.tried)
  field('proposal', payload.proposal)
  field('model', payload.model)
  const env = payload.environment
  field(
    'versions',
    env.packages
      .map((p) => `${p.name}@${p.version}${p.linked ? ' (linked)' : ''}`)
      .join(' ') || 'no @pikku/* found'
  )
  if (env.versionSkew) {
    lines.push('  note: the installed @pikku/* versions are not all the same')
  }
  if (env.linkedFramework) {
    lines.push(
      '  note: an @pikku/* resolves to a workspace or link — this app is running framework code that may be modified'
    )
  }
  field(
    'runtime',
    `node ${env.node} ${env.platform} ${env.packageManager ?? ''}`.trim()
  )
  return lines.join('\n')
}
