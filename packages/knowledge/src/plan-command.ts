import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { readKnowledgeNotes } from './notes.js'
import {
  cascadeProblems,
  functionsDirFor,
  planShortfall,
  readPikkuMeta,
  shallowScenarioProblems,
} from './plan-meta.js'
import {
  PlanSchema,
  checkCovers,
  checkFirstPass,
  checkPlanInternals,
  deferPlanItem,
  planSchemaJson,
  readPlan,
  renderPlanForBuild,
  writePlan,
} from './plan.js'

/**
 * The plan commands, as one module so the CLI binds thin wrappers rather than
 * reimplementing the order the checks run in.
 *
 * `set` is the only writer, and that is the property worth protecting: schema, then the
 * first-pass shape, then the plan against itself and the notes it covers — and nothing
 * reaches disk unless all of them pass.
 *
 * What is deliberately absent is any judgement of whether a plan is a GOOD plan. That
 * needs a model, a budget and a seat, and it belongs to whatever is driving the build,
 * not to a command that must run offline.
 */
const PLAN_FIXED = (path: string) =>
  `${path} already holds this changeset's plan. A plan is fixed once written: it is the order the build is measured against, so it cannot be replaced. Take an item out with \`pikku knowledge plan defer <changeset> <item> --reason <why>\`.`

const problemsFor = async (
  root: string,
  plan: z.infer<typeof PlanSchema>
): Promise<string[]> => [
  ...checkFirstPass(plan),
  ...checkPlanInternals(plan),
  ...checkCovers(plan, await readKnowledgeNotes(root)),
]

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
  changeset: z.string().min(1),
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
  { changeset, forBuild }: z.infer<typeof KnowledgePlanShowInput>
): Promise<KnowledgePlanShowResult> => {
  const read = readPlan(root, changeset)
  if (!read.ok) return { ok: false, path: read.path, body: read.reason }
  return {
    ok: true,
    path: read.path,
    body: forBuild
      ? renderPlanForBuild(read.plan)
      : `${JSON.stringify(read.plan, null, 2)}\n`,
  }
}

export const KnowledgePlanProgressInput = z.object({
  changeset: z.string().min(1),
})

export const KnowledgePlanProgressOutput = z.object({
  ok: z.boolean(),
  path: z.string(),
  /** Why nothing could be measured. Empty whenever the plan was read. */
  message: z.string(),
  done: z.array(z.string()),
  missing: z.array(z.string()),
  deferred: z.array(z.string()),
  problems: z.array(z.string()),
})

export type KnowledgePlanProgressResult = z.infer<
  typeof KnowledgePlanProgressOutput
>

/**
 * What the changeset still owes its plan, read from codegen rather than from anyone's word.
 *
 * This is the half of the gate the build cannot edit. `missing` is set membership against
 * pikku's generated meta — the function exists or it does not — so a build that reports
 * itself finished with four of its planned functions unwritten is refused by a check that
 * never consults its opinion. The build agent both writing the plan and grading it against
 * its own todo list is the failure the plan format was introduced against; this command is
 * where the two seats meet.
 *
 * The three problem sources are kept separate because they read different things and would
 * each be missed on their own: `planShortfall` reconciles the meta, `shallowScenarioProblems`
 * catches a browser scenario that only proves its route loads, and `cascadeProblems` reads the
 * migrations, which no generated meta describes.
 *
 * Only the FIRST pass blocks what is MISSING. A later pass is real work that comes back
 * as changes of its own, and refusing on it is what made plan size fatal rather than merely slow — so it
 * comes back under `deferred`, reported and never blocking.
 *
 * `problems` block whatever pass they came from, because a problem is not unbuilt work: the
 * thing EXISTS and does something other than what was planned. A pass-2 function that shipped
 * wide open against a planned permission rule is a hole in the app now, and deferring it would
 * be deferring the hole rather than the work.
 */
export const runKnowledgePlanProgress = async (
  root: string,
  { changeset }: z.infer<typeof KnowledgePlanProgressInput>
): Promise<KnowledgePlanProgressResult> => {
  const empty = { done: [], missing: [], deferred: [], problems: [] }
  const read = readPlan(root, changeset)
  if (!read.ok) {
    return { ok: false, path: read.path, message: read.reason, ...empty }
  }
  const meta = readPikkuMeta(functionsDirFor(root))
  const shortfall = planShortfall(read.plan, meta)
  const problems = [
    ...shortfall.problems,
    ...shallowScenarioProblems(read.plan, meta),
    ...cascadeProblems(read.plan, root),
  ]
  return {
    ok: shortfall.missing.length === 0 && problems.length === 0,
    path: read.path,
    message: '',
    done: shortfall.done,
    missing: shortfall.missing,
    deferred: shortfall.deferred,
    problems,
  }
}

export const KnowledgePlanSetInput = z.object({
  changeset: z.string().min(1),
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
  { changeset, file }: z.infer<typeof KnowledgePlanSetInput>
): Promise<KnowledgePlanSetResult> => {
  const existing = readPlan(root, changeset)
  const path = existing.path
  if (existing.ok) {
    return { ok: false, path, problems: [PLAN_FIXED(path)] }
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    return { ok: false, path, problems: [`${file}: ${String(err)}`] }
  }
  const parsed = PlanSchema.safeParse({
    ...(raw as object),
    changeset,
  })
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
  const problems = await problemsFor(root, parsed.data)
  if (problems.length > 0) return { ok: false, path, problems }
  return {
    ok: true,
    path: writePlan(root, parsed.data),
    problems: [],
  }
}

export const KnowledgePlanDeferInput = z.object({
  changeset: z.string().min(1),
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
  { changeset, item, reason }: z.infer<typeof KnowledgePlanDeferInput>
): Promise<KnowledgePlanDeferResult> => {
  const read = readPlan(root, changeset)
  if (!read.ok) return { ok: false, path: read.path, message: read.reason }
  const deferred = deferPlanItem(read.plan, item, reason)
  if (!deferred.ok) {
    return { ok: false, path: read.path, message: deferred.reason }
  }
  return {
    ok: true,
    path: writePlan(root, deferred.plan),
    message: `${deferred.label} moved to the next pass.`,
  }
}
