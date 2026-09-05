import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  MAX_DEFERRALS,
  PLAN_VERSION,
  checkAgainstMilestone,
  deferPlanItem,
  itemsOf,
  checkFirstPass,
  checkPlanInternals,
  deferOutstandingItems,
  knowledgeCoverage,
  planPathFor,
  planSchemaJson,
  plannedApps,
  readPlan,
  renderPlanForBuild,
} from './plan.js'
import { noteHash } from './notes.js'
import { basePlan } from './plan-fixture.js'

// The plan is the denominator the build agent does not own. Every check here is one
// the agent could otherwise satisfy by lowering the bar — so a gap that lets a plan
// through is worth more than a false refusal.

test('a well-formed plan passes every check', () => {
  const plan = basePlan()
  assert.deepEqual(checkFirstPass(plan), [])
  assert.deepEqual(checkPlanInternals(plan), [])
  assert.deepEqual(
    checkAgainstMilestone(
      plan,
      { entities: 'entry', path: 'knowledge/milestones/01.md' },
      ['owner']
    ),
    []
  )
})

test('pass 1 without a screen is refused — the cap this replaces let that through', () => {
  const plan = basePlan()
  plan.ui = { kind: 'n/a', description: 'Later.' }
  const problems = checkFirstPass(plan)
  assert.equal(problems.length, 1)
  assert.match(problems[0]!, /no `ui` item/)
})

test('a cli milestone passes pass 1 with no ui at all', () => {
  // The `ui` slot's whole reason for existing is that "not needed, and here's why" can
  // be said out loud — and `checkFirstPass` used to make that legal to write and
  // impossible to pass, for a CLI as much as for an app.
  const plan = basePlan()
  plan.ui = { kind: 'n/a', description: 'A command, not a page.' }
  if (plan.scenarios.backend.kind === 'built')
    plan.scenarios.backend.items[0]!.fn = 'createEntry'
  assert.deepEqual(checkFirstPass(plan, 'cli'), [])
})

test('a cli milestone with nothing driving what it wires is refused', () => {
  // The obligation does not disappear with the surface, only the level it is met at:
  // an app is proved in the browser, a command at the backend.
  const plan = basePlan()
  plan.ui = { kind: 'n/a', description: 'A command, not a page.' }
  const problems = checkFirstPass(plan, 'cli')
  assert.equal(problems.length, 1)
  assert.match(problems[0]!, /"fn": "createEntry"/)
})

test('a pass-1 route with no browser scenario is refused', () => {
  const plan = basePlan()
  if (plan.ui.kind === 'built') plan.ui.items[0]!.scenarios = []
  plan.scenarios.browser = { kind: 'n/a', description: 'Skipped.' }
  const problems = checkFirstPass(plan)
  assert.ok(problems.some((p) => /no browser scenario/.test(p)))
})

test('a permission rule with no refusal scenario is refused', () => {
  const plan = basePlan()
  plan.scenarios.permission = { kind: 'n/a', description: 'None needed.' }
  const problems = checkPlanInternals(plan)
  assert.ok(problems.some((p) => /createEntry.*no scenario proving/s.test(p)))
})

test('a function touching personal data with no permission rule is flagged', () => {
  const plan = basePlan()
  if (plan.functions.kind === 'built')
    plan.functions.items[0]!.permission = null
  plan.scenarios.permission = { kind: 'n/a', description: 'None needed.' }
  const problems = checkPlanInternals(plan)
  assert.ok(problems.some((p) => /personal data/.test(p)))
})

// The refusal above has to be answerable, and the only answer it can accept is this one.
// It used to offer a second: say in the `description` that anyone signed in may call it.
// Nothing read the description for that, and the trigger IS the description naming the
// table — so following the advice could only keep the refusal firing. The architect spent
// its whole attempt budget on it, the milestone got no plan, and every later
// `fabric build-milestone` refused with "has no plan and one could not be written".
test('an open function touching personal data clears once a scenario names it', () => {
  const plan = basePlan()
  if (plan.functions.kind === 'built')
    plan.functions.items[0]!.permission = null
  assert.deepEqual(checkPlanInternals(plan), [])
})

test('a declared scope that gates nothing is flagged', () => {
  const plan = basePlan()
  plan.scopes = {
    kind: 'built',
    description: 'One.',
    items: [{ name: 'entry:write', description: 'Write.' }],
  }
  const problems = checkPlanInternals(plan)
  assert.ok(problems.some((p) => /entry:write.*gates no function/.test(p)))
})

test('a milestone entity no function or table mentions is flagged', () => {
  const plan = basePlan()
  const problems = checkAgainstMilestone(
    plan,
    { entities: 'entry, reminder', path: 'knowledge/milestones/01.md' },
    []
  )
  assert.equal(problems.length, 1)
  assert.match(problems[0]!, /reminder/)
})

test('a persona nobody drives through the UI is flagged', () => {
  const plan = basePlan()
  const problems = checkAgainstMilestone(
    plan,
    { entities: 'entry', path: 'x.md' },
    ['owner', 'admin']
  )
  assert.ok(problems.some((p) => /'admin'/.test(p)))
})

test('coverage separates built from merely claimed', () => {
  const notes = [
    { path: 'entities/entry.md', body: 'entry body' },
    { path: 'decisions/privacy.md', body: 'privacy body' },
    { path: 'entities/tag.md', body: 'tag body' },
  ]
  const built = basePlan()
  const claimed = basePlan()
  claimed.milestone = 'knowledge/milestones/02-tags.md'
  claimed.covers = [
    {
      note: 'decisions/privacy.md',
      hash: noteHash('privacy body'),
      complete: true,
    },
  ]
  const coverage = knowledgeCoverage(notes, [
    { plan: built, status: 'built' },
    { plan: claimed, status: 'proposed' },
  ])
  assert.deepEqual(
    coverage.map((c) => [c.note, c.state]),
    [
      ['entities/entry.md', 'covered'],
      ['decisions/privacy.md', 'claimed'],
      ['entities/tag.md', 'uncovered'],
    ]
  )
})

test('a partial claim never discharges the note', () => {
  const plan = basePlan()
  plan.covers = [
    {
      note: 'entities/entry.md',
      hash: noteHash('entry body'),
      complete: false,
    },
  ]
  const coverage = knowledgeCoverage(
    [{ path: 'entities/entry.md', body: 'entry body' }],
    [{ plan, status: 'built' }]
  )
  assert.equal(coverage[0]!.state, 'claimed')
})

test('a milestone that landed with deferrals leaves its note part-built', () => {
  const plan = basePlan()
  plan.deferrals = [
    {
      item: 'scenario:ownerWritesTodayScenario',
      why: 'the clock ran out',
      at: '2026-08-29T00:00:00.000Z',
    },
  ]
  const coverage = knowledgeCoverage(
    [{ path: 'entities/entry.md', body: 'entry body' }],
    [{ plan, status: 'built' }]
  )
  assert.equal(coverage[0]!.state, 'partial')
  assert.deepEqual(
    coverage[0]!.leftBehind.map((d) => d.item),
    ['scenario:ownerWritesTodayScenario']
  )
})

// The termination property: the librarian is told once, writes the milestone, and the
// note stops being backlog. Without it the same directive fires on every planner turn.
test('a follow-up milestone claiming the note takes it out of the backlog', () => {
  const built = basePlan()
  built.deferrals = [
    {
      item: 'scenario:ownerWritesTodayScenario',
      why: 'the clock ran out',
      at: '2026-08-29T00:00:00.000Z',
    },
  ]
  const followUp = basePlan('knowledge/milestones/02-writing-it.md')
  const coverage = knowledgeCoverage(
    [{ path: 'entities/entry.md', body: 'entry body' }],
    [
      { plan: built, status: 'built' },
      { plan: followUp, status: 'proposed' },
    ]
  )
  assert.equal(coverage[0]!.state, 'claimed')
})

test('a killed milestone defers everything pass 1 still owed, past the voluntary limit', () => {
  const plan = basePlan()
  const { plan: after, deferred } = deferOutstandingItems(
    plan,
    [
      'function:createEntry',
      'scenario:secondEntryRefusedScenario',
      'scenario:ownerWritesTodayScenario',
      'wire:POST /entry',
    ],
    'the milestone was stopped at its cap'
  )
  assert.deepEqual(deferred, [
    'function:createEntry',
    'scenario:secondEntryRefusedScenario',
    'scenario:ownerWritesTodayScenario',
  ])
  assert.equal(after.deferrals.length, 3)
  assert.equal(itemsOf(after.functions)[0]!.pass, 2)
  assert.deepEqual(plan.deferrals, [])
})

// The ledger's honesty over time depends on this one: the interview keeps running, and
// a sentence added to a note that shipped months ago is the commonest way a new
// requirement arrives. Keyed on path alone it would read `covered` forever.
test('a note edited after it was built goes back to the backlog', () => {
  const plan = basePlan()
  const coverage = knowledgeCoverage(
    [
      {
        path: 'entities/entry.md',
        body: 'entry body, plus a rule added later',
      },
    ],
    [{ plan, status: 'built' }]
  )
  assert.equal(coverage[0]!.state, 'changed')
  assert.deepEqual(coverage[0]!.by, [
    'knowledge/milestones/01-the-daily-entry.md',
  ])
})

test('a schema failure names the field path so the reader can fix it in one edit', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'plan-'))
  try {
    mkdirSync(join(cwd, 'knowledge/milestones'), { recursive: true })
    const plan = basePlan() as unknown as Record<string, unknown>
    delete (plan.functions as Record<string, unknown>).description
    writeFileSync(
      join(cwd, planPathFor('knowledge/milestones/01.md')),
      JSON.stringify(plan)
    )
    const read = readPlan(cwd, 'knowledge/milestones/01.md')
    assert.equal(read.ok, false)
    if (!read.ok) assert.match(read.reason, /functions/)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('a plan from a version this reader does not know is refused as a version', () => {
  // Published, the format is a contract with readers that shipped before it changed.
  // Parsing optimistically reports a version bump as a scattering of field errors, and
  // the reader spends its turn editing fields to match a schema it cannot satisfy.
  const cwd = mkdtempSync(join(tmpdir(), 'plan-'))
  try {
    mkdirSync(join(cwd, 'knowledge/milestones'), { recursive: true })
    const plan = { ...basePlan(), version: PLAN_VERSION + 1 }
    writeFileSync(
      join(cwd, planPathFor('knowledge/milestones/01.md')),
      JSON.stringify(plan)
    )
    const read = readPlan(cwd, 'knowledge/milestones/01.md')
    assert.equal(read.ok, false)
    if (!read.ok) assert.match(read.reason, /only understands 1/)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('a missing plan says so rather than passing silently', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'plan-'))
  try {
    const read = readPlan(cwd, 'knowledge/milestones/01.md')
    assert.equal(read.ok, false)
    if (!read.ok) assert.match(read.reason, /No plan at/)
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('a cascade with no scenario proving it is refused', () => {
  const plan = basePlan()
  if (plan.model.kind === 'built') {
    plan.model.items[0]!.relationships = [
      { column: 'id', references: 'user', onDelete: 'cascade' },
    ]
  }
  const problems = checkPlanInternals(plan)
  assert.ok(
    problems.some((p) =>
      /cascades when a `user` is deleted, with no scenario/.test(p)
    )
  )
})

test('a cascade proved by a scenario the plan never promises is refused', () => {
  const plan = basePlan()
  if (plan.model.kind === 'built') {
    plan.model.items[0]!.relationships = [
      {
        column: 'id',
        references: 'user',
        onDelete: 'cascade',
        provedBy: 'noSuchScenario',
      },
    ]
  }
  const problems = checkPlanInternals(plan)
  assert.ok(
    problems.some((p) => /no scenario in this plan has that name/.test(p))
  )
})

test('a cascade proved by a planned scenario passes', () => {
  const plan = basePlan()
  if (plan.model.kind === 'built') {
    plan.model.items[0]!.relationships = [
      {
        column: 'id',
        references: 'user',
        onDelete: 'cascade',
        provedBy: 'secondEntryRefusedScenario',
      },
    ]
  }
  assert.deepEqual(checkPlanInternals(plan), [])
})

test('a relationship on a column the table does not have is refused', () => {
  const plan = basePlan()
  if (plan.model.kind === 'built') {
    plan.model.items[0]!.relationships = [
      { column: 'owner_id', references: 'user', onDelete: 'restrict' },
    ]
  }
  const problems = checkPlanInternals(plan)
  assert.ok(problems.some((p) => /is not one of the table's fields/.test(p)))
})

// Two audiences is the ordinary case, not the exception — a bike shop has mechanics and
// the customer booking the repair, a landlord app has the landlord and the tenant. The
// plan is written before either app exists, so nothing but the plan can say there are two.
test('the apps a plan calls for are read off its roles, in order', () => {
  const plan = basePlan()
  plan.roles = {
    kind: 'built',
    description: 'Two sides of a counter.',
    items: [
      { name: 'mechanic', description: 'Works the bench.', app: 'workshop' },
      {
        name: 'counter',
        description: 'Takes the booking in.',
        app: 'workshop',
      },
      {
        name: 'rider',
        description: 'Books their bike in and checks on it.',
        app: 'storefront',
      },
    ],
  }
  assert.deepEqual(plannedApps(plan), ['workshop', 'storefront'])

  const rendered = renderPlanForBuild(plan)
  assert.match(rendered, /APPS: 2/)
  assert.match(rendered, /`workshop` — mechanic, counter/)
  assert.match(rendered, /`storefront` — rider/)
  assert.match(rendered, /Create a frontend for each one after the first/)
  assert.match(rendered, /`mechanic` \[workshop\]/)
})

// A project where everyone is a colleague is a real answer and often the right one — it
// just has to be SAID. Every role names its app, so one app is one slug repeated rather
// than a field left off, and the build gets no APPS block and no nudge.
test('a single-audience plan is one named app, not a silence', () => {
  const plan = basePlan()
  const rendered = renderPlanForBuild(plan)
  assert.deepEqual(plannedApps(plan), ['journal'])
  assert.equal(rendered.includes('APPS:'), false)
  assert.equal(rendered.includes('Create a frontend'), false)
})

test('a screen names the app it belongs to', () => {
  const plan = basePlan()
  plan.ui = {
    kind: 'built',
    description: 'One screen each side.',
    items: [
      {
        route: '/jobs',
        description: 'The bench queue.',
        pass: 1,
        app: 'workshop',
        scenarios: [],
      },
      {
        route: '/',
        description: 'Book a bike in.',
        pass: 1,
        app: 'storefront',
        scenarios: [],
      },
    ],
  }
  const rendered = renderPlanForBuild(plan)
  assert.match(rendered, /`\/jobs` \[workshop\] \(pass 1\)/)
  assert.match(rendered, /`\/` \[storefront\] \(pass 1\)/)
})

// Two audiences and a screen that does not say whose it is builds one app with both
// sides' pages jumbled into it — the single-app outcome three runs in a row produced,
// and the reason `app` stopped being optional.
test('a two-app plan is refused if a screen does not say which app it is on', () => {
  const plan = basePlan()
  plan.roles = {
    kind: 'built',
    description: 'Two sides of a counter.',
    items: [
      { name: 'mechanic', description: 'Works the bench.', app: 'workshop' },
      { name: 'rider', description: 'Books the bike in.', app: 'storefront' },
    ],
  }
  plan.ui = {
    kind: 'built',
    description: 'One screen each side, one unassigned.',
    items: [
      {
        route: '/jobs',
        description: 'The bench queue.',
        pass: 1,
        app: 'workshop',
        scenarios: [],
      },
      { route: '/', description: 'Book a bike in.', pass: 1, scenarios: [] },
    ],
  }
  const problems = checkPlanInternals(plan)
  assert.equal(problems.length, 1)
  assert.match(problems[0]!, /`\/` does not say which one/)
})

test('a screen on an app nobody signs into is refused', () => {
  const plan = basePlan()
  plan.roles = {
    kind: 'built',
    description: 'Two sides of a counter.',
    items: [
      { name: 'mechanic', description: 'Works the bench.', app: 'workshop' },
      { name: 'rider', description: 'Books the bike in.', app: 'storefront' },
    ],
  }
  plan.ui = {
    kind: 'built',
    description: 'One screen on an app no role uses.',
    items: [
      {
        route: '/admin',
        description: 'The back office.',
        pass: 1,
        app: 'backoffice',
        scenarios: [],
      },
    ],
  }
  assert.match(checkPlanInternals(plan)[0]!, /which no role signs into/)
})

test('the architect is told what `app` means on a role, not just on a screen', () => {
  const schema = JSON.parse(planSchemaJson())
  const role = schema.properties.roles.oneOf
    .flatMap((variant: any) =>
      variant.properties?.items ? [variant.properties.items.items] : []
    )
    .at(0)
  assert.ok(role, 'roles slot exposes its item shape')
  const described = role.properties.app.description
  assert.match(described, /counter, not the org chart/)
  assert.match(
    described,
    /the build creates a frontend for each one after the first/
  )
  assert.match(described, /REQUIRED on every role/)
  assert.ok(
    role.required.includes('app'),
    'app is required, so one app is a decision the architect states rather than an omission'
  )
})

test('a milestone requiring a workflow is refused a plan that wires none', () => {
  const plan = basePlan()
  const problems = checkAgainstMilestone(
    plan,
    {
      entities: 'entry',
      path: 'knowledge/milestones/01.md',
      requires: 'transport:workflow',
    },
    ['owner']
  )
  assert.equal(problems.length, 1)
  assert.match(problems[0]!, /requires `transport:workflow`/)
  assert.match(problems[0]!, /not a token to drop from/)
})

test('wiring the transport the milestone asked for satisfies it', () => {
  const plan = basePlan()
  if (plan.functions.kind === 'built')
    plan.functions.items[0]!.wire = { transport: 'workflow' }
  assert.deepEqual(
    checkAgainstMilestone(
      plan,
      {
        entities: 'entry',
        path: 'knowledge/milestones/01.md',
        requires: 'transport:workflow',
      },
      ['owner']
    ),
    []
  )
})

// The librarian is taught `transport:sse` and the plan schema has no field that can carry
// it, so demanding it would refuse every plan for a live board with no way to comply.
test('a transport the plan cannot express is not demanded', () => {
  const plan = basePlan()
  assert.deepEqual(
    checkAgainstMilestone(
      plan,
      {
        entities: 'entry',
        path: 'knowledge/milestones/01.md',
        requires: '[transport:sse]',
      },
      ['owner']
    ),
    []
  )
})

test('a build defers one impossible pass-1 item, and only within its budget', () => {
  const plan = basePlan()
  assert.equal(deferPlanItem(plan, 'scope:read', 'no').ok, false)
  assert.equal(deferPlanItem(plan, 'wire:POST /entry', 'no').ok, false)
  assert.equal(deferPlanItem(plan, 'function:noSuchThing', 'no').ok, false)
  assert.equal(deferPlanItem(plan, 'entity:entry', 'no').ok, false)
  assert.equal(deferPlanItem(plan, 'createEntry', 'no').ok, false)

  const first = deferPlanItem(
    plan,
    'function:createEntry',
    'the provider has no write API'
  )
  assert.equal(first.ok, true)
  if (!first.ok) return
  assert.equal(itemsOf(plan.functions)[0]!.pass, 1)
  assert.equal(itemsOf(first.plan.functions)[0]!.pass, 2)
  assert.deepEqual(
    first.plan.deferrals.map((d) => d.item),
    ['function:createEntry']
  )
  assert.equal(
    deferPlanItem(first.plan, 'function:createEntry', 'again').ok,
    false
  )

  const second = deferPlanItem(
    first.plan,
    'scenario:ownerWritesTodayScenario',
    'nothing to drive'
  )
  assert.equal(second.ok, true)
  if (!second.ok) return
  assert.equal(second.plan.deferrals.length, MAX_DEFERRALS)
  assert.equal(
    deferPlanItem(
      second.plan,
      'scenario:secondEntryRefusedScenario',
      'and this too'
    ).ok,
    false
  )
  assert.match(renderPlanForBuild(second.plan), /DEFERRED/)
})

// What to do once pass 1 is built belongs to whoever drives the build, not to the plan
// format: naming one harness's command here would put it in front of every reader.
test('the closing instruction is the caller’s, and absent by default', () => {
  const plan = basePlan()
  const bare = renderPlanForBuild(plan)
  assert.match(bare, /Build pass 1\./)
  assert.equal(/then run/.test(bare), false)

  const driven = renderPlanForBuild(
    plan,
    'When pass 1 is done, run `acme finish`.'
  )
  assert.match(driven, /When pass 1 is done, run `acme finish`\./)
})
