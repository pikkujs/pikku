import { readFileSync } from 'node:fs'
import { z } from 'zod'
import {
  gherkinOf,
  personasIn,
  readMilestones,
  surfaceOf,
  type MilestoneNote,
} from './milestone.js'
import {
  PlanSchema,
  checkAgainstMilestone,
  checkFirstPass,
  checkPlanInternals,
  deferPlanItem,
  planIdFor,
  planPathFor,
  planSchemaJson,
  readPlan,
  renderPlanForBuild,
  writePlan,
} from './plan.js'

/**
 * The plan commands, as one module so the CLI binds four thin wrappers rather than
 * reimplementing the order the checks run in.
 *
 * `set` is the only writer, and that is the property worth protecting: schema, then the
 * first-pass shape, then the plan against its own milestone — and nothing reaches disk
 * unless all three pass. A plan validated at gate time instead has already cost the
 * build it was measured against.
 *
 * What is deliberately absent is any judgement of whether a plan is a GOOD plan. That
 * needs a model, a budget and a seat, and it belongs to whatever is driving the build,
 * not to a command that must run offline.
 */
const NO_MILESTONE = (milestone: string) =>
  `No milestone note matching "${milestone}". Pass the note's id (its filename stem) or its path under knowledge/milestones/.`

const resolve = async (
  root: string,
  milestone: string
): Promise<MilestoneNote | null> => {
  const notes = await readMilestones(root)
  return (
    notes.find((note) => note.path === milestone) ??
    notes.find((note) => planIdFor(note.path) === milestone) ??
    null
  )
}

const problemsFor = (
  plan: z.infer<typeof PlanSchema>,
  note: MilestoneNote
): string[] => {
  const surface = surfaceOf(note)
  const gherkin = gherkinOf(note)
  return [
    ...checkFirstPass(plan, surface),
    ...checkPlanInternals(plan),
    ...checkAgainstMilestone(
      plan,
      note,
      gherkin ? personasIn(gherkin) : [],
      surface
    ),
  ]
}

export const KnowledgePlanSchemaInput = z.object({})

export const KnowledgePlanSchemaOutput = z.object({
  schema: z.string(),
})

export type KnowledgePlanSchemaResult = z.infer<
  typeof KnowledgePlanSchemaOutput
>

export const runKnowledgePlanSchema = (): KnowledgePlanSchemaResult => ({
  schema: planSchemaJson(),
})

export const KnowledgePlanShowInput = z.object({
  milestone: z.string().min(1),
  forBuild: z.boolean().optional(),
})

export const KnowledgePlanShowOutput = z.object({
  ok: z.boolean(),
  path: z.string(),
  body: z.string(),
})

export type KnowledgePlanShowResult = z.infer<typeof KnowledgePlanShowOutput>

export const runKnowledgePlanShow = async (
  root: string,
  { milestone, forBuild }: z.infer<typeof KnowledgePlanShowInput>
): Promise<KnowledgePlanShowResult> => {
  const note = await resolve(root, milestone)
  if (!note) return { ok: false, path: '', body: NO_MILESTONE(milestone) }
  const read = readPlan(root, note.path)
  if (!read.ok) return { ok: false, path: read.path, body: read.reason }
  return {
    ok: true,
    path: read.path,
    body: forBuild
      ? renderPlanForBuild(read.plan)
      : `${JSON.stringify(read.plan, null, 2)}\n`,
  }
}

export const KnowledgePlanSetInput = z.object({
  milestone: z.string().min(1),
  file: z.string().min(1),
})

export const KnowledgePlanSetOutput = z.object({
  ok: z.boolean(),
  path: z.string(),
  problems: z.array(z.string()),
  schema: z.string().optional(),
})

export type KnowledgePlanSetResult = z.infer<typeof KnowledgePlanSetOutput>

export const runKnowledgePlanSet = async (
  root: string,
  { milestone, file }: z.infer<typeof KnowledgePlanSetInput>
): Promise<KnowledgePlanSetResult> => {
  const note = await resolve(root, milestone)
  if (!note) return { ok: false, path: '', problems: [NO_MILESTONE(milestone)] }
  const path = planPathFor(note.path)
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    return { ok: false, path, problems: [`${file}: ${String(err)}`] }
  }
  const parsed = PlanSchema.safeParse(raw)
  if (!parsed.success) {
    // The schema rides along with a shape refusal. Naming the bad field is not enough on
    // its own: a writer told `transport` is invalid, with no way to ask what the options
    // ARE, goes looking instead of editing.
    return {
      ok: false,
      path,
      problems: parsed.error.issues
        .slice(0, 10)
        .map(
          (issue) => `${issue.path.join('.') || '(root)'} — ${issue.message}`
        ),
      schema: planSchemaJson(),
    }
  }
  const problems = problemsFor(parsed.data, note)
  if (problems.length > 0) return { ok: false, path, problems }
  return {
    ok: true,
    path: writePlan(root, note.path, parsed.data),
    problems: [],
  }
}

export const KnowledgePlanDeferInput = z.object({
  milestone: z.string().min(1),
  item: z.string().min(1),
  reason: z.string().min(1),
})

export const KnowledgePlanDeferOutput = z.object({
  ok: z.boolean(),
  path: z.string(),
  message: z.string(),
})

export type KnowledgePlanDeferResult = z.infer<typeof KnowledgePlanDeferOutput>

export const runKnowledgePlanDefer = async (
  root: string,
  { milestone, item, reason }: z.infer<typeof KnowledgePlanDeferInput>
): Promise<KnowledgePlanDeferResult> => {
  const note = await resolve(root, milestone)
  if (!note) return { ok: false, path: '', message: NO_MILESTONE(milestone) }
  const read = readPlan(root, note.path)
  if (!read.ok) return { ok: false, path: read.path, message: read.reason }
  const deferred = deferPlanItem(read.plan, item, reason)
  if (!deferred.ok) {
    return { ok: false, path: read.path, message: deferred.reason }
  }
  return {
    ok: true,
    path: writePlan(root, note.path, deferred.plan),
    message: `${deferred.label} moved to the next pass.`,
  }
}
