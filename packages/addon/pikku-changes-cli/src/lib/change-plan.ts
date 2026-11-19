import { z } from 'zod'
import { CloudPreconditionError } from '@pikku/cli/addon-support'
import { SPECIALISTS, inferSpecialist } from './specialists.js'

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
    /** The pages (route paths) a frontend change builds; required in a clone project. */
    pages: z.array(z.string().trim().min(1)).optional(),
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
/** A frontend change of a clone builds at most this many pages, so each one is compared with the original. */
export const MAX_CLONE_PAGES = 5

/** The `Pages:` line a filed change carries its plan's `pages` in. */
const PAGES_LINE = /^Pages:[ \t]*(.+)$/m

/** The body as filed: with the change's pages on a `Pages:` line the done gate reads back. */
export const bodyWithPages = (change: PlannedChange): string =>
  change.pages?.length
    ? `${change.body}\n\nPages: ${change.pages.join(', ')}`
    : change.body

/** The pages a filed change declared (its `Pages:` line), or none. */
export const declaredPages = (body: string | null | undefined): string[] =>
  (body?.match(PAGES_LINE)?.[1] ?? '')
    .split(',')
    .map((page) => page.trim())
    .filter(Boolean)

/**
 * A change that builds pages: filed for the frontend specialist, or reading
 * like a page change whatever specialist it was filed with. In a clone such a
 * change names its pages, so a page change cannot escape the compare by being
 * filed as \`build\`.
 */
export const buildsPages = (change: {
  specialist?: string | null
  title?: string | null
  body?: string | null
}): boolean =>
  change.specialist === 'frontend' ||
  inferSpecialist(change.title, change.body) === 'frontend'

const hasOutcome = (body: string): boolean => {
  const text = body.toLowerCase()
  return OUTCOME_PHRASES.some((phrase) => text.includes(phrase))
}

/** A body that declares mocked functions, or says why the screens need none. */
const MOCK_TRUE = /mock:\s*true/i
const NO_MOCK_REASON = /\bno mocks?\b[^.]*\bbecause\b/i

const label = (change: Partial<PlannedChange>, index: number): string =>
  `change ${index + 1}${change.ref ? ` ("${change.ref}")` : ''}`

/**
 * Every problem with the plan, in the order a fix should address them.
 * `clone`: the project rebuilds an existing site, so each frontend change
 * names its pages, at most MAX_CLONE_PAGES of them.
 */
export function planProblems(
  raw: unknown,
  { clone = false }: { clone?: boolean } = {}
): {
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
        return `${where}: remove ${issue.keys.map((k) => `"${k}"`).join(', ')}; a change has only ref, title, body, specialist, dependsOn and pages. Write open points as "Decision: ..." in the body.`
      if (field === 'specialist')
        return `${where}: "specialist" must be one of ${SPECIALISTS.join(', ')}.`
      if (field === 'dependsOn')
        return `${where}: "dependsOn" must be a list of refs, e.g. ["data"].`
      if (field === 'pages')
        return `${where}: "pages" must be a list of route paths, e.g. ["/", "/about"].`
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
    if (clone && buildsPages(change)) {
      const pages = change.pages ?? []
      if (!pages.length)
        problems.push(
          `${label(change, index)}: this project rebuilds an existing site, so a change that builds pages (a frontend change, or one whose title or body is about pages, screens or layout) lists the pages it builds in "pages", e.g. ["/", "/about"], at most ${MAX_CLONE_PAGES}. Each listed page must match the original before the change is done.`
        )
      else if (pages.length > MAX_CLONE_PAGES)
        problems.push(
          `${label(change, index)}: it covers ${pages.length} pages. Split the pages into changes of at most ${MAX_CLONE_PAGES} pages each, each with its own "pages" list; a shared layout or theme goes in a first frontend change with the pages it is checked on.`
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
      pages: Array.isArray(change.pages)
        ? change.pages.map(text).filter(Boolean)
        : undefined,
    }
  })
}

/** The plan, or a refusal naming every problem. */
export function validatePlan(
  raw: unknown,
  options?: { clone?: boolean }
): PlannedChange[] {
  const { plan, problems } = planProblems(raw, options)
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

const IGNORED_HOSTS =
  /^(localhost|127\.|0\.0\.0\.0|\[::1\]|example\.|.*\.local$|pikku\.dev$)/

/** The outside sites a plan names (a scheme-qualified address in a title or body), one per host. */
export function outsideSites(plan: PlannedChange[]): string[] {
  const hosts = new Map<string, string>()
  for (const change of plan)
    for (const match of `${change.title}\n${change.body}`.matchAll(
      /https?:\/\/([^\s/)\]"'<>,]+)[^\s)\]"'<>,]*/g
    )) {
      const host = match[1].toLowerCase()
      if (!IGNORED_HOSTS.test(host) && !hosts.has(host))
        hosts.set(host, match[0])
    }
  return [...hosts.values()]
}

/**
 * A plan that names a site to rebuild is planned from what the site holds, so
 * it is refused until the project has the capture or the archaeology notes
 * (`isCloneProject`): a plan written from the address alone is a guess.
 */
export function siteNotLookedAtRefusal(sites: string[]): string {
  return [
    'The plan was not filed: it names a site you have not looked at yet (' +
      sites.join(', ') +
      ').',
    'Look first, then file the plan from what you found:',
    '- follow the pikku-site-archaeology skill: capture the pages with `pikku ui pages capture <url> --out artifacts/references/<site>`,',
    '- write what every page, form and button does and stores into `knowledge/site/` (notes only),',
    '- then run the same `pikku changes file --plan artifacts/plan.json` again.',
  ].join('\n')
}
