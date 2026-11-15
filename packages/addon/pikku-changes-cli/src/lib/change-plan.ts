import { z } from 'zod'
import { CloudPreconditionError } from '@pikku/cli/addon-support'
import { SPECIALISTS } from './specialists.js'

/**
 * A whole plan filed in one call. The structure a cheap model forgets when it
 * is only described in skill text — order, dependencies, specialists, the
 * `mock: true` step for screens — is checked here instead, and a plan that
 * breaks it is refused with every problem named, so one retry can fix it.
 */
export const PlanChange = z
  .object({
    ref: z.string().trim().min(1).max(40),
    title: z.string().trim().min(1),
    body: z.string().trim().min(1),
    specialist: z.enum(SPECIALISTS),
    dependsOn: z.array(z.string().trim().min(1)).default([]),
  })
  .strict()

export const ChangePlan = z.array(PlanChange).min(1)

export type PlannedChange = z.infer<typeof PlanChange>

/**
 * The phrases that make a body say what the person can see or do once the
 * change is done. Kept small on purpose: the refusal quotes this list, and the
 * model copies one of them.
 */
export const OUTCOME_PHRASES = [
  'done when',
  'you can',
  'they can',
  'can see',
  'can now',
] as const

const MIN_BODY_WORDS = 8

const hasOutcome = (body: string): boolean => {
  const text = body.toLowerCase()
  return OUTCOME_PHRASES.some((phrase) => text.includes(phrase))
}

/** A body that declares mocked functions, or says why the screens need none. */
const MOCK_TRUE = /mock:\s*true/i
const NO_MOCK_REASON = /\bno mocks?\b[^.]*\bbecause\b/i

const label = (change: Partial<PlannedChange>, index: number): string =>
  `change ${index + 1}${change.ref ? ` ("${change.ref}")` : ''}`

/** Every problem with the plan, in the order a fix should address them. */
export function planProblems(raw: unknown): {
  plan: PlannedChange[] | null
  problems: string[]
} {
  const parsed = ChangePlan.safeParse(raw)
  const problems: string[] = []
  if (!parsed.success) {
    const shape = parsed.error.issues.map((issue) => {
      const [index, field] = issue.path as [number?, string?]
      if (typeof index !== 'number')
        return Array.isArray(raw)
          ? 'The plan has no changes; list at least one.'
          : 'The plan must be a JSON array of changes: [{ "ref", "title", "body", "specialist", "dependsOn" }, ...].'
      const item = (Array.isArray(raw) ? raw[index] : undefined) ?? {}
      const where = label(item as Partial<PlannedChange>, index)
      if (issue.code === 'unrecognized_keys')
        return `${where}: remove ${issue.keys.map((k) => `"${k}"`).join(', ')}; a change has only ref, title, body, specialist and dependsOn. Write open points as "Decision: ..." in the body.`
      if (field === 'specialist')
        return `${where}: "specialist" must be one of ${SPECIALISTS.join(', ')}.`
      if (field === 'dependsOn')
        return `${where}: "dependsOn" must be a list of refs, e.g. ["data"].`
      return `${where}: "${field}" is required and must be non-empty text.`
    })
    problems.push(...shape)
    if (!Array.isArray(raw) || !raw.length) return { plan: null, problems }
  }

  // The checks below also run on a plan the schema refused, over whatever
  // each change does carry, so one refusal names every problem at once.
  const plan = parsed.success ? parsed.data : lenient(raw as unknown[])
  const refs = new Map<string, number>()
  plan.forEach((change, index) => {
    if (!change.ref) return
    if (refs.has(change.ref))
      problems.push(
        `${label(change, index)}: ref "${change.ref}" is already used by change ${refs.get(change.ref)! + 1}; give each change its own ref.`
      )
    else refs.set(change.ref, index)
  })

  plan.forEach((change, index) => {
    for (const dep of change.dependsOn) {
      if (dep === change.ref)
        problems.push(`${label(change, index)}: it depends on itself.`)
      else if (!refs.has(dep))
        problems.push(
          `${label(change, index)}: dependsOn names "${dep}", which is not a ref in this plan. Refs are: ${[...refs.keys()].join(', ')}.`
        )
    }
    const words = change.body.split(/\s+/).filter(Boolean).length
    if (!words) return
    if (words < MIN_BODY_WORDS)
      problems.push(
        `${label(change, index)}: the body is shorter than a sentence. Say what is built and what the person sees when it is done.`
      )
    else if (!hasOutcome(change.body))
      problems.push(
        `${label(change, index)}: the body needs a sentence saying what the person sees or does when it is done, using one of: ${OUTCOME_PHRASES.map((p) => `"${p}"`).join(', ')}.`
      )
  })
  if (problems.length) return { plan: parsed.success ? plan : null, problems }

  const edges = new Map(plan.map((c) => [c.ref, c.dependsOn]))
  const cycle = findCycle(
    plan.map((c) => c.ref),
    edges
  )
  if (cycle) {
    problems.push(
      `dependsOn has a cycle: ${cycle.join(' → ')}. A change cannot wait on something that waits on it.`
    )
    return { plan, problems }
  }

  const [first, ...rest] = plan
  if (first!.dependsOn.length)
    problems.push(
      `change 1 ("${first!.ref}") depends on ${first!.dependsOn.join(', ')}. The first change is the data change and depends on nothing.`
    )
  const unrooted = rest.filter((c) => !reaches(c.ref, first!.ref, edges))
  if (unrooted.length) {
    const root = rest.find((c) =>
      plan.every((o) => o.ref === c.ref || reaches(o.ref, c.ref, edges))
    )
    problems.push(
      root
        ? `"${root.ref}" is the change every other change depends on, so it must come first: move it to the start of the plan.`
        : `The first change ("${first!.ref}") must be the data change that every other change depends on, directly or through another change. Add "${first!.ref}" to dependsOn of: ${unrooted.map((c) => c.ref).join(', ')}.`
    )
  }

  if (
    plan.some((c) => c.specialist === 'frontend') &&
    !plan.some((c) => MOCK_TRUE.test(c.body) || NO_MOCK_REASON.test(c.body))
  )
    problems.push(
      `The plan has frontend changes, so the screens need functions to call before the real ones are built. In the first change's body, list each function the screens call (name, input, output) declared \`mock: true\`, or write "No mocks needed because ..." if they call only functions that exist.`
    )
  return { plan, problems }
}

/** What each change of a malformed plan carries, for the checks that can still run. */
function lenient(raw: unknown[]): PlannedChange[] {
  const text = (value: unknown) =>
    typeof value === 'string' ? value.trim() : ''
  return raw.map((item) => {
    const change = (item && typeof item === 'object' ? item : {}) as Record<
      string,
      unknown
    >
    return {
      ref: text(change.ref),
      title: text(change.title),
      body: text(change.body),
      specialist: change.specialist as PlannedChange['specialist'],
      dependsOn: Array.isArray(change.dependsOn)
        ? change.dependsOn.map(text).filter(Boolean)
        : [],
    }
  })
}

/** The plan, or a refusal naming every problem. */
export function validatePlan(raw: unknown): PlannedChange[] {
  const { plan, problems } = planProblems(raw)
  if (problems.length || !plan)
    throw new CloudPreconditionError(
      [
        'The plan was not filed. Fix these and run the same command again:',
        ...problems.map((p) => `- ${p}`),
      ].join('\n')
    )
  return plan
}

export function parsePlanText(text: string, source: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new CloudPreconditionError(
      `The plan was not filed: ${source} is not valid JSON (${(error as Error).message}).`
    )
  }
}

/** The changes in an order where each one's dependencies come before it. */
export function filingOrder(plan: PlannedChange[]): PlannedChange[] {
  const done = new Set<string>()
  const order: PlannedChange[] = []
  while (order.length < plan.length)
    for (const change of plan)
      if (!done.has(change.ref) && change.dependsOn.every((d) => done.has(d))) {
        done.add(change.ref)
        order.push(change)
        break
      }
  return order
}

function reaches(
  from: string,
  to: string,
  edges: Map<string, string[]>
): boolean {
  const seen = new Set<string>()
  const stack = [...(edges.get(from) ?? [])]
  while (stack.length) {
    const ref = stack.pop()!
    if (ref === to) return true
    if (seen.has(ref)) continue
    seen.add(ref)
    stack.push(...(edges.get(ref) ?? []))
  }
  return false
}

function findCycle(
  refs: string[],
  edges: Map<string, string[]>
): string[] | null {
  const state = new Map<string, 'open' | 'closed'>()
  const path: string[] = []
  const visit = (ref: string): string[] | null => {
    if (state.get(ref) === 'closed') return null
    if (state.get(ref) === 'open')
      return [...path.slice(path.indexOf(ref)), ref]
    state.set(ref, 'open')
    path.push(ref)
    for (const dep of edges.get(ref) ?? []) {
      const cycle = visit(dep)
      if (cycle) return cycle
    }
    path.pop()
    state.set(ref, 'closed')
    return null
  }
  for (const ref of refs) {
    const cycle = visit(ref)
    if (cycle) return cycle
  }
  return null
}
