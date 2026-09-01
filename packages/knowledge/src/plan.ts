import { z } from 'zod'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MILESTONES_DIR,
  listOf,
  noteHash,
  type MilestoneSurface,
} from './notes.js'

/**
 * The technical plan for one milestone: what has to exist for the milestone to be
 * built, written BEFORE the build and read by the gate afterwards.
 *
 * It exists because the build plan used to be the build agent's own `todo` list,
 * which makes the agent both author and examiner — it can build
 * a fraction, plan only that fraction, and certify itself complete. A plan written by
 * a different seat, against the milestone, is a denominator the builder does not own.
 *
 * JSON rather than a knowledge note on purpose. Every other artefact under
 * `knowledge/` is prose a human reads; this one is consumed field-by-field by the
 * gate, and a markdown parser is one more place a misspelt heading silently passes.
 * It also cannot live INSIDE the milestone note: that note is frozen once its status
 * leaves `proposed`, so rewriting it would change what the builder was told.
 *
 * The plan holds INTENT. Reality lives in pikku's generated meta (`.pikku/**`), which
 * already inventories functions, wires, scopes, roles, workflows, agents and features.
 * Nothing here duplicates that — only what codegen cannot infer: why a thing exists,
 * which pass it belongs to, and which knowledge note it discharges.
 */
export const PLAN_VERSION = 1

export const FIRST_PASS = 1

export const MAX_DEFERRALS = 2

const Deferral = z.object({
  item: z.string().min(1),
  why: z.string().min(1),
  at: z.string().min(1),
})

export type Deferral = z.infer<typeof Deferral>

/**
 * A slot is either filled or explicitly not needed, and both carry prose.
 *
 * An OPTIONAL field would collapse the two states that matter most: a slot nobody
 * thought about and a slot deliberately left empty read identically as `undefined`.
 * Forcing `n/a` to carry its reason is what turns an omission into a decision, and it
 * is the omission — four unwired functions and no screen — that every failed build so
 * far has been.
 */
const slot = <T extends z.ZodTypeAny>(item: T) =>
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('built'),
      description: z.string().min(1),
      items: z.array(item).min(1),
    }),
    z.object({ kind: z.literal('n/a'), description: z.string().min(1) }),
  ])

/**
 * What a column holds, in privacy terms rather than storage terms.
 *
 * This is the field that lets a permission claim be checked against the data instead
 * of only against itself: a function returning a `personal` column with no permission
 * rule is a defect the gate can name, where prose alone would need a reader.
 */
export const CLASSIFICATIONS = [
  'public',
  'internal',
  'personal',
  'sensitive',
] as const

const ModelField = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  classification: z.enum(CLASSIFICATIONS),
})

/**
 * What happens to this row when the thing it belongs to is deleted.
 *
 * A foreign key states which rows are related; it does not state what the product wants
 * when the parent goes, and that is a product decision with three genuinely different
 * answers. Naming it in the plan is what lets a build be wrong about it: `cascade` and
 * `orphan` produce identical schemas until someone deletes something.
 */
const ModelRelationship = z.object({
  /** The column on THIS table pointing at the parent, e.g. `user_id`. */
  column: z.string().min(1),
  /** The parent table it points at. */
  references: z.string().min(1),
  onDelete: z.enum(['cascade', 'restrict', 'orphan']),
  /**
   * The `pikkuScenario` that deletes the parent and asserts what became of this row.
   *
   * Required for `cascade`, on the same reasoning as a permission rule needing a refusal
   * scenario: a cascade nobody ever triggers is a `REFERENCES` clause, not a behaviour.
   * Both builds measured on the journal fixture wrote a cascade and no delete path at all,
   * so nothing they shipped could have told you whether it worked.
   */
  provedBy: z.string().min(1).optional(),
})

const ModelItem = z.object({
  table: z.string().min(1),
  description: z.string().min(1),
  fields: z.array(ModelField).min(1),
  /** Optional so plans written before relationships existed still parse. */
  relationships: z.array(ModelRelationship).default([]),
})

/**
 * A wire and a permission rule live ON the function rather than in parallel lists,
 * because that is where pikku enforces them: the rule IS the function's `permissions`
 * field, and a wire without its function means nothing. Two lists to keep in step is
 * two lists that drift.
 *
 * `permission` is a sentence, not a role name — the roles are an implementation
 * detail the engineer picks, while the rule ("only the person who wrote it can edit
 * it") is the part that has to survive the translation. `null` means open to anyone
 * signed in, stated rather than left to omission.
 */
/**
 * Every way a function can be reached other than its own RPC.
 *
 * Exported because `plan-meta.ts` derives its per-transport meta paths from this, so a
 * transport added here fails to compile until it has somewhere to be checked back from —
 * rather than being planned, built, and silently certified against nothing.
 */
export const WireTransport = z.enum([
  'http',
  'queue',
  'channel',
  'scheduler',
  'workflow',
])

const FunctionItem = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  pass: z.number().int().min(1),
  wire: z
    .object({
      transport: WireTransport,
      route: z
        .string()
        .optional()
        .describe(
          'The path, for `http` only — the URL the outside system posts to.'
        ),
    })
    .nullable()
    .optional()
    .describe(
      "OMIT THIS for a normal function, which is nearly all of them: pikku already serves every function as an RPC at /rpc/<name> and the client calls it by name, so there is no wire to decide. State one when the function is reached some OTHER way — its own HTTP path via wireHTTP (a webhook, a payment callback, a public URL someone else posts to), a queue job, or a channel. State one ALSO when the work itself is not a request: `workflow` for a process that pauses on a person and then carries on (an approval, a sign-off, an escalation), `scheduler` for something that happens on the app's own clock with nobody present (an overdue sweep, a nightly digest, a reminder). Those two are not alternate URLs, they are what the milestone IS — its note says so on `requires:`, and a plan that omits them ships a `status` column nothing advances or a job nobody runs."
    ),
  scopes: z.array(z.string()).default([]),
  permission: z.string().nullable(),
})

const UiItem = z.object({
  route: z.string().min(1),
  description: z.string().min(1),
  pass: z.number().int().min(1),
  app: z
    .string()
    .optional()
    .describe(
      'The app slug this screen belongs to, matching the `app` on the roles who use it. OMIT it for a single-app project. A screen serves ONE app — the same list shown to staff and to customers is two screens with different nav and different permitted actions, not one screen. A screen anyone can open without an account is not a separate app: it is a PUBLIC ROUTE on the app that owns it, so route it outside `/app` (`/`, `/shop`, `/shop/$id`, `/checkout`) and leave `/app/*` for the screens that require a session. Every project needs `/` to be a real page that a signed-out visitor can use — a plan whose only entry point is a login screen has no front door.'
    ),
  scenarios: z.array(z.string()).default([]),
})

const NamedItem = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
})

/**
 * A role and the app they sign into.
 *
 * `app` is what makes a second frontend a PLANNED fact rather than a build-time guess, and
 * it is the only field `plannedApps` reads — so its guidance lives in `.describe()`, which
 * survives into the JSON Schema the architect is handed, not in this comment, which does not.
 */
const RoleItem = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  app: z
    .string()
    .min(1)
    .describe(
      'REQUIRED on every role: the slug of the app this person USES — lowercase, one word, named for what they do there (`workshop`, `storefront`, `portal`). The distinct values across all roles ARE the apps this project needs, and the build agent runs `fabric new-app` for each one after the first, so this field alone decides how many frontends exist. When everyone is on the same side, give every role the SAME slug — one app is a real answer and often the right one. The test is the counter, not the org chart: the mechanic, the person on the counter and the bookkeeper are colleagues and share ONE app, differing only by nav and permitted actions; a customer WITH AN ACCOUNT is across the counter and gets their own, as do the tenant, the patient and the practitioner. Never invent a person the milestone notes do not name in order to reach two. A ROLE WHO NEVER SIGNS IN NEVER GETS A SLUG OF THEIR OWN: an app is built around the people who log into it, so a shopper who checks out as a guest, a diner reading a menu or anyone opening a link takes the SAME slug as the signed-in role they transact with, and their screens live on that app\u2019s public routes outside `/app`. A shop where a guest buys and one seller packs is ONE app and ONE slug: `/`, `/shop` and `/checkout` public, `/app/orders` behind the login. Give that shopper their own slug and the storefront is built on a second hostname while the product\u2019s own domain answers the people it is for with a login screen \u2014 the exact failure this field exists to prevent.'
    ),
})

const ScenarioItem = z.object({
  feature: z.string().min(1),
  scenario: z.string().min(1),
  fn: z.string().optional(),
  /**
   * The `pikkuScenario` export this becomes, e.g. `saveEntryScenario` — the only field here
   * a completion gate can check. `feature` and `scenario` are prose written for a reader,
   * and prose cannot be matched against codegen without guessing; a plan whose scenarios are
   * only prose is an intention, not an obligation. Optional so plans written before this
   * existed still parse, but `checkFirstPass` requires it of new ones.
   */
  name: z.string().min(1).optional(),
  /**
   * Which pass writes it, defaulting by level — see `scenarioPass`. Permission scenarios
   * default to pass 2 because they harden a journey that has to exist before they can
   * cover it, and a milestone whose skeleton works ships without waiting on the whole
   * role x resource cross product.
   */
  pass: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Which pass writes this scenario. Backend and browser scenarios default to pass 1 — they prove the journey works. Permission scenarios default to pass 2: they harden a journey that has to exist first, and only pass 1 has to be built for the milestone to ship, so a role x resource cross product here costs the milestone nothing.'
    ),
})

/**
 * Scenarios are keyed by level rather than tagged with one, so a plan carrying four
 * backend scenarios and no browser scenario fails on its shape. A flat list lets that
 * through, and it is exactly the milestone that builds an API and ships no screen.
 */
const Scenarios = z.object({
  backend: slot(ScenarioItem),
  browser: slot(ScenarioItem),
  permission: slot(ScenarioItem),
})

/**
 * `complete: false` is the honest default for a note whose claims span milestones.
 * Without it the ledger lies in the flattering direction — one milestone touching a
 * decision note would mark the whole note discharged and the rest of it would never
 * be built.
 *
 * `hash` is what makes the claim about CONTENT rather than about a filename. A note is
 * edited after the milestone that discharged it ships — the interview keeps going, and
 * a new sentence in an old note is the commonest way a requirement arrives. Keyed on
 * path alone that note stays `covered` forever and the new sentence is never built by
 * anybody. Recording what was actually claimed means an edit downgrades the note to
 * `changed`, which is the backlog signal.
 */
const Covers = z.object({
  note: z.string().min(1),
  hash: z.string().min(6),
  complete: z.boolean(),
})

export const PlanSchema = z.object({
  version: z.literal(PLAN_VERSION),
  milestone: z.string().min(1),
  description: z.string().min(1),
  covers: z.array(Covers).min(1),
  model: slot(ModelItem),
  functions: slot(FunctionItem),
  roles: slot(RoleItem),
  scopes: slot(NamedItem),
  ui: slot(UiItem),
  scenarios: Scenarios,
  deferrals: z
    .array(Deferral)
    .default([])
    .describe(
      'NOT YOURS TO WRITE — leave it out. The build agent appends to this through `fabric plan-defer` when a pass-1 item turns out to be impossible, and the reason it gives is the record of where this plan was wrong.'
    ),
})

/**
 * The pass a planned scenario belongs to.
 *
 * Backend and browser scenarios prove the journey works, so they are the walking
 * skeleton and default to pass 1. Permission scenarios prove nobody else can reach it —
 * necessary, but hardening of a journey that must already exist, and combinatorial in
 * roles x resources: run hmt3fz3c0's first milestone planned ten of them against four
 * other items, and the build never shipped a working deployed app because completion
 * demanded the cross product before the skeleton could be signed off.
 */
export const scenarioPass = (
  level: 'backend' | 'browser' | 'permission',
  item: { pass?: number }
): number => item.pass ?? (level === 'permission' ? 2 : 1)

export type Plan = z.infer<typeof PlanSchema>
export type PlanSlot<T> =
  | { kind: 'built'; description: string; items: T[] }
  | { kind: 'n/a'; description: string }

export const itemsOf = <T>(s: { kind: string; items?: T[] }): T[] =>
  s.kind === 'built' ? (s.items ?? []) : []

/**
 * The apps this plan calls for, in declaration order — the first is the primary.
 *
 * Read off the roles rather than stored separately, so there is one answer to "how many
 * apps" and it cannot drift from who signs into them. A plan with no roles at all wants
 * one app, which is why that case returns `[]` rather than inventing a slug.
 */
export function plannedApps(plan: Plan): string[] {
  const seen: string[] = []
  for (const role of itemsOf(plan.roles)) {
    if (role.app && !seen.includes(role.app)) seen.push(role.app)
  }
  return seen
}

/** Where a milestone's plan lives: beside the note, same stem. */
export function planPathFor(milestonePath: string): string {
  return milestonePath.replace(/\.(md|markdown|txt)$/i, '.plan.json')
}

/** A plan's id, which is the note's stem and the console's URL segment. */
export function planIdFor(milestonePath: string): string {
  return milestonePath
    .replace(/\.(md|markdown|txt)$/i, '')
    .split('/')
    .pop()!
}

/**
 * The milestone note a plan id names, resolved by scanning the milestones directory
 * rather than by joining the id onto a path.
 *
 * The id arrives from a URL, so building a path out of it hands the caller the file
 * system — `../../.env` is a plan id as far as string concatenation is concerned.
 * Matching against ids we generated ourselves means an unknown id finds nothing.
 */
export function milestonePathForPlanId(
  cwd: string,
  planId: string
): string | null {
  let entries: string[]
  try {
    entries = readdirSync(join(cwd, MILESTONES_DIR))
  } catch {
    return null
  }
  const note = entries.find(
    (entry) =>
      /\.(md|markdown|txt)$/i.test(entry) && planIdFor(entry) === planId
  )
  return note ? `${MILESTONES_DIR}/${note}` : null
}

export type PlanRead =
  | { ok: true; plan: Plan; path: string }
  | {
      ok: false
      path: string
      reason: string
      /**
       * There is no file, as opposed to a file that will not read.
       *
       * Callers that only ask `.ok` treat the two alike, which is how an architect came to
       * be told a milestone "has no plan — write it" with an unparseable one sitting at
       * that exact path.
       */
      missing?: true
    }

/**
 * Read and validate a milestone's plan.
 *
 * Validation errors are reported with their field path because the reader is an
 * agent: "invalid plan" costs a turn of guessing, while `functions.items[2].permission
 * — expected string, received undefined` is one edit.
 */
export function readPlan(cwd: string, milestonePath: string): PlanRead {
  const path = planPathFor(milestonePath)
  const full = join(cwd, path)
  if (!existsSync(full)) {
    return {
      ok: false,
      path,
      missing: true,
      reason: `No plan at ${path}. Write it before dispatching the build.`,
    }
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(full, 'utf8'))
  } catch (err) {
    return {
      ok: false,
      path,
      reason: `${path} is not valid JSON: ${String(err)}`,
    }
  }
  const version = (raw as { version?: unknown } | null)?.version
  if (version !== PLAN_VERSION) {
    return {
      ok: false,
      path,
      reason: `${path} is plan version ${JSON.stringify(version)}; this reader only understands ${PLAN_VERSION}.`,
    }
  }
  const parsed = PlanSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join('.') || '(root)'} — ${i.message}`)
      .join('; ')
    return {
      ok: false,
      path,
      reason: `${path} does not match the plan schema: ${issues}`,
    }
  }
  return { ok: true, plan: parsed.data, path }
}

/**
 * The plan as the build agent is given it.
 *
 * Rendered rather than handed over as JSON: the builder reads it once at the top of the
 * turn and the shape has to be scannable, while the gate reads the file field by field.
 * An `n/a` slot is printed WITH its reason — the whole point of the discriminated slot is
 * that "no roles, because this app has one kind of user" and "nobody thought about roles"
 * stop looking alike, and that distinction is only useful if the builder sees it.
 */
export function renderPlanForBuild(plan: Plan): string {
  const lines: string[] = []
  const slot = <T>(
    name: string,
    s: PlanSlot<T>,
    render: (item: T) => string
  ) => {
    if (s.kind === 'n/a') {
      lines.push(`${name}: none — ${s.description}`)
      return
    }
    lines.push(`${name}: ${s.description}`)
    for (const item of s.items) lines.push(`  - ${render(item)}`)
  }

  lines.push(
    `PLAN — ${plan.milestone}`,
    '',
    plan.description,
    '',
    'PASS 1 COMPLETES THIS MILESTONE. Items marked pass 2 or higher are deferred — the gate does',
    'not ask for them and the next milestone picks them up. Build pass 1, then run `fabric build-complete`.',
    ''
  )
  slot(
    'DATA',
    plan.model,
    (m) =>
      `\`${m.table}\` — ${m.description}\n` +
      m.fields
        .map((f) => `      ${f.name}: ${f.type} [${f.classification}]`)
        .join('\n') +
      m.relationships
        .map(
          (r) =>
            `\n      ${r.column} → ${r.references}, on delete ${r.onDelete}${r.provedBy ? ` (proved by \`${r.provedBy}\`)` : ''}`
        )
        .join('')
  )
  slot('FUNCTIONS', plan.functions, (f) => {
    const wire = f.wire
      ? `${f.wire.transport}${f.wire.route ? ` ${f.wire.route}` : ''}`
      : 'rpc — /rpc/' + f.name
    const scopes = f.scopes.length ? ` scopes: ${f.scopes.join(', ')};` : ''
    const perm = f.permission
      ? ` permission: ${f.permission}`
      : ' permission: none — anyone signed in'
    return `\`${f.name}\` (pass ${f.pass}) — ${f.description}\n      wire: ${wire};${scopes}${perm}`
  })
  const apps = plannedApps(plan)
  if (apps.length > 1) {
    lines.push(
      `APPS: ${apps.length} — these people are on opposite sides of a counter and each side gets its own app.`
    )
    for (const app of apps) {
      const who = itemsOf(plan.roles)
        .filter((r) => r.app === app)
        .map((r) => r.name)
      lines.push(`  - \`${app}\` — ${who.join(', ')}`)
    }
    lines.push(
      `Run \`fabric new-app --slug <slug> --serves <group> --personas <ids>\` for each one after the first, then \`fabric scaffold --app <slug>\` to write its screens.`
    )
  }
  slot(
    'ROLES',
    plan.roles,
    (r) => `\`${r.name}\` [${r.app}] — ${r.description}`
  )
  slot('SCOPES', plan.scopes, (s) => `\`${s.name}\` — ${s.description}`)
  slot('UI', plan.ui, (u) => {
    const covered = u.scenarios.length
      ? `\n      proved by: ${u.scenarios.join(', ')}`
      : ''
    return `\`${u.route}\`${u.app ? ` [${u.app}]` : ''} (pass ${u.pass}) — ${u.description}${covered}`
  })
  lines.push(
    '',
    'The backticked id on each scenario below is the `pikkuScenario` export you write. Completion checks for it by that exact name, so a scenario you skip or rename reads as unbuilt.'
  )
  for (const [level, title, s] of [
    ['backend', 'BACKEND SCENARIOS', plan.scenarios.backend],
    ['browser', 'BROWSER SCENARIOS', plan.scenarios.browser],
    ['permission', 'PERMISSION SCENARIOS', plan.scenarios.permission],
  ] as const) {
    slot(
      title,
      s,
      (sc) =>
        `\`${sc.name ?? '<unnamed>'}\` (pass ${scenarioPass(level, sc)}) — ${sc.feature}: ${sc.scenario}${sc.fn ? ` (drives \`${sc.fn}\`)` : ''}`
    )
  }
  if (plan.deferrals.length > 0) {
    lines.push(
      '',
      'DEFERRED — you moved these off pass 1 already. They do NOT block this milestone and you',
      'must not build them now; the reason you gave is on the record and reaches the planner.',
      ...plan.deferrals.map((d) => `  - \`${d.item}\` — ${d.why}`)
    )
  }
  return lines.join('\n')
}

export const planSchemaJson = (): string =>
  JSON.stringify(z.toJSONSchema(PlanSchema, { io: 'input' }))

export function writePlan(
  cwd: string,
  milestonePath: string,
  plan: Plan
): string {
  const path = planPathFor(milestonePath)
  writeFileSync(join(cwd, path), `${JSON.stringify(plan, null, 2)}\n`)
  return path
}

export type PlanDefer =
  { ok: true; plan: Plan; label: string } | { ok: false; reason: string }

const deferrableIds = (plan: Plan): string[] => [
  ...itemsOf(plan.functions)
    .filter((f) => f.pass === FIRST_PASS)
    .map((f) => `function:${f.name}`),
  ...(
    [
      ['backend', plan.scenarios.backend],
      ['browser', plan.scenarios.browser],
      ['permission', plan.scenarios.permission],
    ] as const
  ).flatMap(([level, slot]) =>
    itemsOf(slot)
      .filter((i) => i.name && scenarioPass(level, i) === FIRST_PASS)
      .map((i) => `scenario:${i.name}`)
  ),
]

/**
 * Move ONE pass-1 item to pass 2. Returns a new plan so the caller can re-check the
 * walking skeleton before anything reaches disk. Only functions and scenarios are
 * deferrable — they are the only items `planShortfall` blocks on.
 */
export function deferPlanItem(
  plan: Plan,
  itemId: string,
  why: string
): PlanDefer {
  if (plan.deferrals.length >= MAX_DEFERRALS) {
    return {
      ok: false,
      reason:
        `This milestone has already deferred ${plan.deferrals.length} item(s) — ${plan.deferrals
          .map((d) => `\`${d.item}\``)
          .join(
            ', '
          )} — which is the limit. Everything still on pass 1 has to be built. If the ` +
        `milestone genuinely cannot land, say which items and why in your final message and stop; ` +
        `deferring the rest would ship a milestone that is not the one that was planned.`,
    }
  }
  if (plan.deferrals.some((d) => d.item === itemId)) {
    return {
      ok: false,
      reason: `\`${itemId}\` is already deferred — it is not blocking you.`,
    }
  }

  const options = deferrableIds(plan)
  const refuseUnknown = (detail: string): PlanDefer => ({
    ok: false,
    reason:
      `${detail}\n\nThe pass-1 items you can defer are:\n` +
      (options.length
        ? options.map((id) => `  • ${id}`).join('\n')
        : '  (none — pass 1 is empty)'),
  })

  const [kind, ...rest] = itemId.split(':')
  const name = rest.join(':')
  if (!name) return refuseUnknown(`\`${itemId}\` is not an item id.`)

  const next = structuredClone(plan)

  if (kind === 'function') {
    const fn = itemsOf(next.functions).find((f) => f.name === name)
    if (!fn) return refuseUnknown(`No function \`${name}\` is planned.`)
    if (fn.pass !== FIRST_PASS) {
      return {
        ok: false,
        reason: `\`${name}\` is already pass ${fn.pass} — it is not blocking you.`,
      }
    }
    fn.pass = FIRST_PASS + 1
    next.deferrals.push({ item: itemId, why, at: new Date().toISOString() })
    return { ok: true, plan: next, label: `function \`${name}\`` }
  }

  if (kind === 'scenario') {
    for (const [level, slot] of [
      ['backend', next.scenarios.backend],
      ['browser', next.scenarios.browser],
      ['permission', next.scenarios.permission],
    ] as const) {
      const found = itemsOf(slot).find((i) => i.name === name)
      if (!found) continue
      if (scenarioPass(level, found) !== FIRST_PASS) {
        return {
          ok: false,
          reason: `\`${name}\` is not a pass-1 scenario — it is not blocking you.`,
        }
      }
      found.pass = FIRST_PASS + 1
      next.deferrals.push({ item: itemId, why, at: new Date().toISOString() })
      return { ok: true, plan: next, label: `${level} scenario \`${name}\`` }
    }
    return refuseUnknown(`No scenario named \`${name}\` is planned.`)
  }

  if (kind === 'wire') {
    return refuseUnknown(
      `A wire is not deferred on its own — it belongs to the function that owns it, so defer that.`
    )
  }
  if (kind === 'scope') {
    return refuseUnknown(
      `A scope carries no pass and cannot be deferred: it is one line in the app's scope list and every planned function that names it needs it to exist.`
    )
  }
  return refuseUnknown(
    `\`${kind}\` is not a deferrable kind — only \`function\` and \`scenario\` are.`
  )
}

/**
 * Move every still-unbuilt pass-1 item to pass 2 at once, for a milestone that was KILLED
 * rather than finished.
 *
 * Deliberately outside `MAX_DEFERRALS`, which bounds what a build agent may talk itself out
 * of — a guillotined milestone chose nothing. Without this a killed milestone records no
 * deferrals at all, so its shortfall is invisible everywhere it is read from: the user is
 * never told what is missing, and `knowledgeCoverage` reads its notes as fully discharged.
 */
export function deferOutstandingItems(
  plan: Plan,
  itemIds: string[],
  why: string
): { plan: Plan; deferred: string[] } {
  const next = structuredClone(plan)
  const at = new Date().toISOString()
  const deferred: string[] = []
  for (const itemId of itemIds) {
    if (next.deferrals.some((d) => d.item === itemId)) continue
    const [kind, ...rest] = itemId.split(':')
    const name = rest.join(':')
    if (!name) continue
    if (kind === 'function') {
      const fn = itemsOf(next.functions).find(
        (f) => f.name === name && f.pass === FIRST_PASS
      )
      if (!fn) continue
      fn.pass = FIRST_PASS + 1
    } else if (kind === 'scenario') {
      const found = (
        [
          ['backend', next.scenarios.backend],
          ['browser', next.scenarios.browser],
          ['permission', next.scenarios.permission],
        ] as const
      )
        .flatMap(([level, slot]) =>
          itemsOf(slot).map((item) => ({ level, item }))
        )
        .find(
          ({ level, item }) =>
            item.name === name && scenarioPass(level, item) === FIRST_PASS
        )
      if (!found) continue
      found.item.pass = FIRST_PASS + 1
    } else {
      continue
    }
    next.deferrals.push({ item: itemId, why, at })
    deferred.push(itemId)
  }
  return { plan: next, deferred }
}

/**
 * The first pass has to put something on a screen — checked as a SHAPE, which is what
 * replaced the old `MAX_ENTITIES_PER_MILESTONE` cap.
 *
 * The cap was a proxy for "small enough to finish" and a bad one: three entities with
 * twenty functions sailed through while five cheap ones were refused, and a milestone
 * could satisfy it while delivering four unwired functions and no page — which is
 * precisely what the last build did. Size stopped being the risk once a plan made
 * partial progress resumable, so what is enforced now is ORDER: pass one is a walking
 * skeleton, and the rest of the milestone waits behind it.
 */
export function checkFirstPass(
  plan: Plan,
  surface: MilestoneSurface = 'app'
): string[] {
  const problems: string[] = []
  const ui = itemsOf(plan.ui).filter((u) => u.pass === 1)
  const fns = itemsOf(plan.functions).filter((f) => f.pass === 1)
  if (surface === 'app' && ui.length === 0) {
    problems.push(
      'Pass 1 has no `ui` item. The first pass has to reach a screen — move one route into pass 1. If this milestone reaches its person some other way, that belongs on the note as `surface:`, not in the plan.'
    )
  }
  if (fns.length === 0) {
    problems.push(
      surface === 'app'
        ? 'Pass 1 has no `functions` item. A screen with nothing behind it is a mock — move the function that serves the pass-1 route into pass 1.'
        : 'Pass 1 has no `functions` item. Pass one has to DO something a person can reach — move the function behind it into pass 1.'
    )
  }
  if (surface !== 'app') {
    const driven = new Set(
      itemsOf(plan.scenarios.backend)
        .map((s) => s.fn)
        .filter(Boolean)
    )
    if (fns.length > 0 && !fns.some((f) => driven.has(f.name))) {
      problems.push(
        `This milestone is \`surface: ${surface}\` and no backend scenario drives a pass-1 function. An app is proved in the browser; this is proved at the backend level — add a \`scenarios.backend\` item carrying \`"fn": "${fns[0]!.name}"\`.`
      )
    }
  }
  // A scenario with no `name` is prose, and prose cannot be checked against codegen — the
  // completion gate would certify the milestone without it. Caught at authoring time, where
  // it costs one edit, rather than at the gate, where it costs a build turn.
  for (const [level, slot] of [
    ['backend', plan.scenarios.backend],
    ['browser', plan.scenarios.browser],
    ['permission', plan.scenarios.permission],
  ] as const) {
    if (slot.kind !== 'built') continue
    for (const item of slot.items) {
      if (!item.name) {
        problems.push(
          `The ${level} scenario "${item.scenario}" has no \`name\`. Give it the \`pikkuScenario\` export it becomes (e.g. \`saveEntryScenario\`), or nothing can verify it was written.`
        )
      }
    }
  }

  const browser = itemsOf(plan.scenarios.browser)
  for (const route of ui) {
    const covered =
      route.scenarios.length > 0 ||
      browser.some((s) => s.feature.includes(route.route))
    if (!covered) {
      problems.push(
        `Pass 1 route \`${route.route}\` has no browser scenario. Without one nothing proves the screen works. ` +
          `Name the scenario in this route's \`scenarios\` (e.g. \`"scenarios": ["opensTonightsPracticeScenario"]\`), ` +
          `or write a browser scenario whose \`feature\` contains \`${route.route}\`.`
      )
    }
  }
  return problems
}

/**
 * What each transport promise is FOR, said in the refusal so the architect does not have
 * to guess which function should carry it.
 */
const TRANSPORT_MEANS: Record<string, string> = {
  workflow:
    'the milestone promises a process that pauses on a person and then carries on, and a `status` column nothing advances renders identically and does nothing',
  scheduler:
    "the milestone promises work that happens on the app's own clock with nobody present, and a button someone remembers to press is a different product",
  queue:
    'the milestone promises work that outlives the request that asked for it',
  channel:
    'the milestone promises the browser pushing back up a socket mid-session',
  http: 'the milestone promises a URL something outside this app posts to',
}

/**
 * The `transport:<name>` tokens on a milestone's `requires:` that a plan can actually
 * express. Anything the plan schema has no field for is skipped rather than demanded —
 * the librarian is taught `transport:sse`, which `WireTransport` cannot carry, and a gate
 * that refused it would be unsatisfiable.
 */
const requiredTransports = (requires: string | undefined): string[] =>
  listOf(requires)
    .map((token) => token.split(':').map((part) => part.trim()))
    .filter(([kind, name]) => kind === 'transport' && !!name)
    .map(([, name]) => name!)
    .filter((name) =>
      (WireTransport.options as readonly string[]).includes(name)
    )

/**
 * Cross-checks between the plan and the milestone note it claims to implement.
 *
 * These do not prove the plan is complete — nothing can prove the architect thought of
 * what it did not think of. They prove the two documents refer to the same thing,
 * which catches the failure actually observed: a plan that quietly drifts off its own
 * milestone.
 */
export function checkAgainstMilestone(
  plan: Plan,
  milestone: { entities?: string; path: string; requires?: string },
  personas: string[],
  surface: MilestoneSurface = 'app'
): string[] {
  const problems: string[] = []
  const wired = new Set<string>(
    itemsOf(plan.functions).flatMap((f) => (f.wire ? [f.wire.transport] : []))
  )
  for (const transport of requiredTransports(milestone.requires)) {
    if (wired.has(transport)) continue
    problems.push(
      `${milestone.path} requires \`transport:${transport}\` and no function in the plan wires one — ${TRANSPORT_MEANS[transport]}. Give the function that does that work \`"wire": { "transport": "${transport}" }\`. If the milestone genuinely does not need it, that is a conversation with the user about the note, not a token to drop from \`requires:\`.`
    )
  }
  const entities = listOf(milestone.entities)
  const haystack = [
    ...itemsOf(plan.functions).map((f) => `${f.name} ${f.description}`),
    ...itemsOf(plan.model).map((m) => `${m.table} ${m.description}`),
  ]
    .join(' ')
    .toLowerCase()
  for (const entity of entities) {
    if (!haystack.includes(entity.toLowerCase())) {
      problems.push(
        `${milestone.path} is about \`${entity}\` but no function or table in the plan mentions it.`
      )
    }
  }
  const driving =
    surface === 'app'
      ? itemsOf(plan.scenarios.browser)
      : [...itemsOf(plan.scenarios.browser), ...itemsOf(plan.scenarios.backend)]
  for (const persona of personas) {
    const driven = driving.some((s) =>
      s.scenario.toLowerCase().includes(persona.toLowerCase())
    )
    if (!driven) {
      problems.push(
        surface === 'app'
          ? `'${persona}' is named in the milestone's scenario but no browser scenario drives them. A persona nobody puts through the UI is a milestone that built a backend. Name them in that scenario's \`scenario\` line.`
          : `'${persona}' is named in the milestone's scenario but no scenario drives them. Name them in the \`scenario\` line of a \`scenarios.backend\` item — a person the plan never puts through the surface is a person nothing proves.`
      )
    }
  }
  return problems
}

/**
 * Internal consistency: things the plan declares but never uses, and rules it states
 * but never proves.
 */
export function checkPlanInternals(plan: Plan): string[] {
  const problems: string[] = []
  const apps = plannedApps(plan)
  if (apps.length > 1) {
    for (const screen of itemsOf(plan.ui)) {
      if (!screen.app) {
        problems.push(
          `This plan has ${apps.length} apps (${apps.join(', ')}) but route \`${screen.route}\` does not say which one it belongs to. Every screen serves ONE app — give it \`"app"\`, matching the roles who use it.`
        )
      } else if (!apps.includes(screen.app)) {
        problems.push(
          `Route \`${screen.route}\` is on app \`${screen.app}\`, which no role signs into. The apps are the distinct \`app\` values across the roles: ${apps.join(', ')}.`
        )
      }
    }
  }
  const fns = itemsOf(plan.functions)
  const usedScopes = new Set(fns.flatMap((f) => f.scopes))
  for (const scope of itemsOf(plan.scopes)) {
    if (!usedScopes.has(scope.name)) {
      problems.push(
        `Scope \`${scope.name}\` is declared but gates no function. Either put it on the function it protects or drop it.`
      )
    }
  }
  const proven = new Set(
    itemsOf(plan.scenarios.permission)
      .map((s) => s.fn)
      .filter(Boolean)
  )
  for (const fn of fns) {
    if (fn.permission !== null && !proven.has(fn.name)) {
      problems.push(
        `\`${fn.name}\` has a permission rule with no scenario proving someone outside it is refused. Add an item to \`scenarios.permission\` carrying \`"fn": "${fn.name}"\` — that field is the link, not the prose — because a rule with no failing case is a claim, not a check.`
      )
    }
  }
  // A cascade is a rule stated in DDL and provable only by deleting something. Held to
  // the same standard as a permission rule above: name the scenario that proves it, and
  // let that scenario be one the plan actually promises, so completion can find it.
  const plannedScenarios = new Set(
    [
      ...itemsOf(plan.scenarios.backend),
      ...itemsOf(plan.scenarios.browser),
      ...itemsOf(plan.scenarios.permission),
    ]
      .map((s) => s.name)
      .filter((n): n is string => Boolean(n))
  )
  for (const table of itemsOf(plan.model)) {
    const columns = new Set(table.fields.map((f) => f.name))
    for (const rel of table.relationships) {
      if (!columns.has(rel.column)) {
        problems.push(
          `\`${table.table}.${rel.column}\` is declared as a relationship to \`${rel.references}\` but is not one of the table's fields. Add the column or fix the name.`
        )
      }
      if (rel.onDelete !== 'cascade') continue
      if (!rel.provedBy) {
        problems.push(
          `\`${table.table}.${rel.column}\` cascades when a \`${rel.references}\` is deleted, with no scenario proving it. Add \`provedBy\` naming a scenario that deletes the ${rel.references} and asserts the ${table.table} rows are gone — a cascade nobody triggers is a claim, not a check.`
        )
      } else if (!plannedScenarios.has(rel.provedBy)) {
        problems.push(
          `\`${table.table}.${rel.column}\` says it is proved by \`${rel.provedBy}\`, but no scenario in this plan has that name. Add it to the scenarios, or point at one that is there.`
        )
      }
    }
  }
  const personalTables = new Set(
    itemsOf(plan.model)
      .filter((m) =>
        m.fields.some(
          (f) =>
            f.classification === 'personal' || f.classification === 'sensitive'
        )
      )
      .map((m) => m.table.toLowerCase())
  )
  for (const fn of fns) {
    if (fn.permission !== null || proven.has(fn.name)) continue
    const touches = [...personalTables].find((t) =>
      fn.description.toLowerCase().includes(t)
    )
    if (touches) {
      problems.push(
        `\`${fn.name}\` reads \`${touches}\`, which holds personal data, and its \`permission\` is null. Either write the rule as a sentence there — "only the person who wrote it may read it" — or leave it null because anyone signed in may genuinely call it. Either way add a \`scenarios.permission\` item carrying \`"fn": "${fn.name}"\`: that field is the link, not the prose, and the scenario is what makes the decision checkable.`
      )
    }
  }
  return problems
}

export type CoverageState =
  'covered' | 'partial' | 'claimed' | 'changed' | 'uncovered'

export type NoteCoverage = {
  note: string
  state: CoverageState
  by: string[]
  /** What the milestones that claimed this note deferred and never built. Empty unless `partial`. */
  leftBehind: Deferral[]
}

/**
 * Which knowledge notes are discharged, which are spoken for, which have moved on
 * since they were planned, and which nobody has planned at all.
 *
 * This is the ledger that replaces re-reading the whole knowledge graph every turn:
 *
 *   covered   — a BUILT milestone claimed it complete, and it has not changed since
 *   changed   — it was claimed, but the note has been edited since; the new content
 *               was never planned by anyone, so it is backlog again
 *   partial   — the milestone that claimed it landed, but with deferrals: part of what
 *               it promised was never built, and no later milestone owns that yet
 *   claimed   — a plan claims it and that milestone has not landed yet
 *   uncovered — nobody has planned it
 *
 * `partial` is what stops a deferral falling out of the world. A deferred item leaves the
 * pass it was planned in and nothing picks it up, so keyed on the milestone alone the note
 * read `covered` and the librarian never wrote the milestone that would finish it. It
 * settles on its own: a follow-up milestone claiming the note makes it `claimed` again.
 *
 * `changed` is the state that keeps the ledger honest over time. Coverage keyed on a
 * path alone silently freezes: the interview keeps running, a sentence gets added to a
 * note that shipped three milestones ago, and nothing ever surfaces it.
 */
export function knowledgeCoverage(
  notes: Array<{ path: string; body?: string; reserved?: string }>,
  plans: Array<{ plan: Plan; status?: string }>
): NoteCoverage[] {
  const claims = new Map<
    string,
    Array<{
      milestone: string
      hash: string
      built: boolean
      leftBehind: Deferral[]
    }>
  >()
  for (const { plan, status } of plans) {
    const landed = status === 'built'
    for (const entry of plan.covers) {
      claims.set(entry.note, [
        ...(claims.get(entry.note) ?? []),
        {
          milestone: plan.milestone,
          hash: entry.hash,
          built: entry.complete && landed && plan.deferrals.length === 0,
          leftBehind: entry.complete && landed ? plan.deferrals : [],
        },
      ])
    }
  }
  return notes
    .filter((n) => !n.reserved && !n.path.startsWith(`${MILESTONES_DIR}/`))
    .map((n) => {
      const claimed = claims.get(n.path)
      if (!claimed)
        return {
          note: n.path,
          state: 'uncovered' as const,
          by: [],
          leftBehind: [],
        }
      const by = claimed.map((c) => c.milestone)
      const current = n.body === undefined ? null : noteHash(n.body)
      const stale = current !== null && !claimed.some((c) => c.hash === current)
      if (stale)
        return { note: n.path, state: 'changed' as const, by, leftBehind: [] }
      if (claimed.some((c) => c.built)) {
        return { note: n.path, state: 'covered' as const, by, leftBehind: [] }
      }
      const leftBehind = claimed.flatMap((c) => c.leftBehind)
      const pending = claimed.some((c) => c.leftBehind.length === 0)
      if (!pending && leftBehind.length > 0) {
        return { note: n.path, state: 'partial' as const, by, leftBehind }
      }
      return { note: n.path, state: 'claimed' as const, by, leftBehind: [] }
    })
}
