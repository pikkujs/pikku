import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PLAN_VERSION, renderPlanForBuild, type Plan } from './plan.js'
import { noteHash } from './notes.js'
import { cascadeProblems, planShortfall, readPikkuMeta } from './plan-meta.js'

// This is the half of the gate the build agent cannot edit. Everything here reconciles
// the plan against pikku's GENERATED meta, so the interesting cases are the ones where
// the agent could otherwise certify itself: a function that was planned and never
// written, a wire that was never made, a rule the plan calls restricted that the code
// leaves wide open.

const plan = (): Plan => ({
  version: PLAN_VERSION,
  deferrals: [],
  milestone: 'knowledge/milestones/01-the-daily-entry.md',
  description: 'One person writes one entry a day and reads their own back.',
  covers: [
    {
      note: 'entities/entry.md',
      hash: noteHash('entry body'),
      complete: true,
    },
  ],
  model: {
    kind: 'built',
    description: 'One table.',
    items: [
      {
        table: 'entry',
        description: 'One row per person per day.',
        fields: [{ name: 'body', type: 'text', classification: 'personal' }],
        relationships: [],
      },
    ],
  },
  functions: {
    kind: 'built',
    description: 'Write and read.',
    items: [
      {
        name: 'createEntry',
        description: "Creates today's entry.",
        pass: 1,
        wire: { transport: 'http', route: 'POST /entry' },
        scopes: [],
        permission: 'Only the signed-in person can write their own entry',
      },
      {
        name: 'listEntries',
        description: 'Their own entries, newest first.',
        pass: 2,
        wire: { transport: 'http', route: 'GET /entry' },
        scopes: [],
        permission: 'Only your own entries come back',
      },
    ],
  },
  roles: {
    kind: 'built',
    description: 'One role.',
    items: [{ name: 'member', description: 'In the org.', app: 'journal' }],
  },
  scopes: { kind: 'n/a', description: 'No third-party access yet.' },
  ui: {
    kind: 'built',
    description: 'One screen.',
    items: [
      {
        route: '/app/today',
        description: "Write today's entry.",
        pass: 1,
        scenarios: ['features/today.feature#Writing today'],
      },
    ],
  },
  scenarios: {
    backend: {
      kind: 'built',
      description: 'The one-per-day rule.',
      items: [
        {
          feature: 'features/entry.feature',
          scenario: 'A second entry for today is refused',
          name: 'secondEntryRefusedScenario',
        },
      ],
    },
    browser: {
      kind: 'built',
      description: 'Writing it.',
      items: [
        {
          feature: 'features/today.feature',
          scenario: "'owner' writes today's entry",
          name: 'ownerWritesTodayScenario',
        },
      ],
    },
    permission: {
      kind: 'built',
      description: 'Someone else cannot.',
      items: [
        {
          fn: 'createEntry',
          feature: 'features/entry-perms.feature',
          scenario: 'Another member is refused',
          name: 'anotherMemberRefusedScenario',
        },
      ],
    },
  },
})

/** A functionsDir whose `.pikku` holds exactly the generated files named. */
function project(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'plan-meta-'))
  for (const [rel, body] of Object.entries(files)) {
    const full = join(dir, '.pikku', rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, JSON.stringify(body))
  }
  return dir
}

/**
 * Everything the shared `plan()` promises, as codegen would report it. The scenario meta is
 * part of "built" because the plan names three scenarios; without it every test focused on
 * functions or wires would also carry three outstanding scenarios.
 */
const bothBuilt = {
  'function/pikku-functions-meta.gen.json': {
    createEntry: { auth: true },
    listEntries: { auth: true },
  },
  'http/pikku-http-wirings-meta.gen.json': {
    POST: { '/entry': {} },
    GET: { '/entry': {} },
  },
  'scenarios/pikku-scenario-functions-meta.gen.json': {
    secondEntryRefusedScenario: {},
    ownerWritesTodayScenario: {},
    anotherMemberRefusedScenario: {},
  },
}

test('a plan whose every function and wire exists has nothing outstanding', () => {
  const dir = project(bothBuilt)
  try {
    const { missing, problems, done } = planShortfall(
      plan(),
      readPikkuMeta(dir)
    )
    assert.deepEqual(missing, [])
    assert.deepEqual(problems, [])
    // Two functions and the plan's three scenarios.
    assert.equal(done.length, 5)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// Completion asks whether the milestone's WALKING SKELETON is done. A later pass is real
// work the next milestone picks up, and blocking on it is what made plan size fatal.
test('a function planned for a later pass is deferred, not blocking', () => {
  const dir = project({
    ...bothBuilt,
    'function/pikku-functions-meta.gen.json': { createEntry: { auth: true } },
    'http/pikku-http-wirings-meta.gen.json': { POST: { '/entry': {} } },
  })
  try {
    const { missing, deferred } = planShortfall(plan(), readPikkuMeta(dir))
    assert.deepEqual(missing, [])
    assert.deepEqual(deferred, ['function listEntries'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// The console renders `Done` beside `10 of 17`, and the seven were the permission
// scenarios a plan defaults to pass 2 — so a row has to say which pass owes it or the two
// numbers read as a lie.
test('a later-pass row is tagged deferred, and a pass-1 row is not', () => {
  const dir = project({
    ...bothBuilt,
    'function/pikku-functions-meta.gen.json': { createEntry: { auth: true } },
    'http/pikku-http-wirings-meta.gen.json': { POST: { '/entry': {} } },
  })
  try {
    const { items } = planShortfall(plan(), readPikkuMeta(dir))
    const byId = new Map(items.map((item) => [item.id, item]))
    assert.equal(byId.get('function:createEntry')?.deferred, false)
    assert.equal(byId.get('function:listEntries')?.deferred, true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a function that exists but was never wired is missing its wire, not itself', () => {
  const dir = project({
    ...bothBuilt,
    'http/pikku-http-wirings-meta.gen.json': { POST: { '/entry': {} } },
  })
  try {
    const { missing, deferred, done } = planShortfall(
      plan(),
      readPikkuMeta(dir)
    )
    assert.deepEqual(missing, [])
    assert.deepEqual(deferred, ['wire GET /entry'])
    assert.ok(done.includes('function listEntries'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// A path parameter is camelCase by convention, and the matcher used to lowercase only the
// plan's side — so a wire that WAS generated read as missing, and the only way for the agent
// to discharge it was to rename the parameter to something no codebase writes.
test('a wire whose route carries a camelCase path parameter matches the generated meta', () => {
  const withParam = plan()
  if (withParam.functions.kind === 'built') {
    withParam.functions.items[1]!.wire = {
      transport: 'http',
      route: 'POST /entry/:entryId/stage',
    }
  }
  const dir = project({
    ...bothBuilt,
    'http/pikku-http-wirings-meta.gen.json': {
      POST: { '/entry': {}, '/entry/:entryId/stage': {} },
    },
  })
  try {
    const { missing } = planShortfall(withParam, readPikkuMeta(dir))
    assert.deepEqual(missing, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// The plan states a permission as prose, which nothing can compare against the rule the
// code enforces. Meta knows whether the function is gated AT ALL, so the one mechanical
// question — planned restricted, shipped open — is still answerable.
test('a function planned as restricted but shipped with auth off is reported', () => {
  const dir = project({
    ...bothBuilt,
    'function/pikku-functions-meta.gen.json': {
      createEntry: { auth: false },
      listEntries: { auth: true },
    },
  })
  try {
    const { problems } = planShortfall(plan(), readPikkuMeta(dir))
    assert.equal(problems.length, 1)
    assert.match(problems[0]!, /createEntry.*auth: false/s)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a feature declaring scenarios that were never written is reported', () => {
  const dir = project({
    ...bothBuilt,
    'scenarios/features.gen.json': {
      'features/today.feature': { entries: [], unresolvedEntries: 2 },
    },
  })
  try {
    const { problems } = planShortfall(plan(), readPikkuMeta(dir))
    assert.equal(problems.length, 1)
    assert.match(problems[0]!, /2 scenario\(s\) that do not exist/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// Fail-open on absent codegen would certify a plan against nothing; every planned item is
// simply missing until the meta says otherwise.
test('a project with no generated meta has everything outstanding', () => {
  const dir = project({})
  try {
    const { missing, deferred, done } = planShortfall(
      plan(),
      readPikkuMeta(dir)
    )
    assert.deepEqual(done, [])
    assert.deepEqual(missing, [
      'function createEntry',
      'backend scenario secondEntryRefusedScenario ("A second entry for today is refused")',
      `browser scenario ownerWritesTodayScenario ("'owner' writes today's entry")`,
    ])
    assert.deepEqual(deferred, [
      'function listEntries',
      'permission scenario anotherMemberRefusedScenario ("Another member is refused")',
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the rendered plan carries the reason an empty slot is empty', () => {
  const text = renderPlanForBuild(plan())
  assert.match(text, /SCOPES: none — No third-party access yet\./)
  assert.match(text, /`createEntry`.*pass 1/)
  assert.match(
    text,
    /permission: Only the signed-in person can write their own entry/
  )
  assert.match(text, /body: text \[personal\]/)
})

// The gate's whole point after the journal runs: a milestone whose scenarios were never
// written must not certify. deepseek-v4-pro delivered 0 of 6 planned scenarios and kimi-k2.6
// delivered 1, and both were marked complete, because nothing compared the plan's scenario
// list against what codegen found.
test('a planned scenario that was never written is missing', () => {
  const dir = project({
    ...bothBuilt,
    // Overrides bothBuilt's scenario meta: only the template's own scenario exists.
    'scenarios/pikku-scenario-functions-meta.gen.json': {
      sessionHealthScenario: {},
    },
  })
  try {
    const { missing, deferred } = planShortfall(plan(), readPikkuMeta(dir))
    assert.ok(missing.some((m) => m.includes('secondEntryRefusedScenario')))
    assert.ok(missing.some((m) => m.includes('ownerWritesTodayScenario')))
    assert.ok(deferred.some((d) => d.includes('anotherMemberRefusedScenario')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('planned scenarios that were written are done, not missing', () => {
  const dir = project({
    ...bothBuilt,
    'scenarios/pikku-scenario-functions-meta.gen.json': {
      secondEntryRefusedScenario: {},
      ownerWritesTodayScenario: {},
      anotherMemberRefusedScenario: {},
    },
  })
  try {
    const { missing, done } = planShortfall(plan(), readPikkuMeta(dir))
    assert.ok(!missing.some((m) => m.includes('scenario')))
    assert.ok(done.includes('scenario secondEntryRefusedScenario'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// Prose alone cannot be checked against codegen, so a nameless scenario is a hole in the
// plan rather than a silent pass.
test('a scenario with no name is reported as a problem', () => {
  const p = plan()
  if (p.scenarios.backend.kind === 'built')
    delete (p.scenarios.backend.items[0] as { name?: string }).name
  const dir = project(bothBuilt)
  try {
    const { problems } = planShortfall(p, readPikkuMeta(dir))
    assert.ok(problems.some((x) => /names no `pikkuScenario` export/.test(x)))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** A repo whose `db/` holds exactly the migrations named. */
function migrations(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'plan-cascade-'))
  for (const [rel, body] of Object.entries(files)) {
    const full = join(dir, 'db', rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }
  return dir
}

const cascadingPlan = (): Plan => {
  const p = plan()
  if (p.model.kind === 'built') {
    p.model.items[0]!.fields.push({
      name: 'user_id',
      type: 'uuid',
      classification: 'internal',
    })
    p.model.items[0]!.relationships = [
      {
        column: 'user_id',
        references: 'user',
        onDelete: 'cascade',
        provedBy: 'secondEntryRefusedScenario',
      },
    ]
  }
  return p
}

test('a cascade the migrations never declare is reported', () => {
  const dir = migrations({
    'sqlite/0003-entry.sql':
      'create table "entry" ("id" text primary key, "user_id" text references "user" ("id"));',
  })
  try {
    const problems = cascadeProblems(cascadingPlan(), dir)
    assert.equal(problems.length, 1)
    assert.match(
      problems[0]!,
      /no migration declares `on delete cascade` on `entry`/
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// The architect cannot know the migration NUMBER — it depends on what already shipped —
// so the check searches every migration rather than the path the plan guessed.
test('a cascade declared under a different migration number still counts', () => {
  const dir = migrations({
    'sqlite/0007-entry.sql':
      'create table "entry" ("id" text primary key, "user_id" text not null references "user" ("id") on delete cascade);',
  })
  try {
    assert.deepEqual(cascadeProblems(cascadingPlan(), dir), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a camelCase plan table finds its snake_case migration', () => {
  const dir = migrations({
    'sqlite/0006-class-bookings.sql':
      'create table "class_bookings" ("id" text primary key, "class_id" text not null references "classes" ("id") on delete cascade);',
  })
  try {
    const p = plan()
    if (p.model.kind === 'built') {
      p.model.items[0]!.table = 'classBookings'
      p.model.items[0]!.relationships = [
        {
          column: 'classId',
          references: 'classes',
          onDelete: 'cascade',
          provedBy: 'someScenario',
        },
      ]
    }
    assert.deepEqual(cascadeProblems(p, dir), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a cascade on a DIFFERENT table does not answer for this one', () => {
  const dir = migrations({
    'postgres/0003-tables.sql': [
      'create table "comment" ("id" text primary key, "entry_id" text references "entry" ("id") on delete cascade);',
      'create table "entry" ("id" text primary key, "user_id" text references "user" ("id"));',
    ].join('\n'),
  })
  try {
    assert.equal(cascadeProblems(cascadingPlan(), dir).length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the SQLite rebuild-and-rename dance declares the cascade', () => {
  const dir = migrations({
    'sqlite/0003-entry.sql':
      'create table "entry" ("id" text primary key, "user_id" text references "user" ("id"));',
    'sqlite/0007-entry-cascade.sql': [
      'create table "entry_new" ("id" text primary key, "user_id" text references "user" ("id") on delete cascade);',
      'insert into "entry_new" select * from "entry";',
      'drop table "entry";',
      'alter table "entry_new" rename to "entry";',
    ].join('\n'),
  })
  try {
    assert.deepEqual(cascadeProblems(cascadingPlan(), dir), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a rebuild renamed onto a DIFFERENT table does not answer for this one', () => {
  const dir = migrations({
    'sqlite/0003-entry.sql':
      'create table "entry" ("id" text primary key, "user_id" text references "user" ("id"));',
    'sqlite/0007-comment-cascade.sql': [
      'create table "comment_new" ("id" text primary key, "entry_id" text references "entry" ("id") on delete cascade);',
      'alter table "comment_new" rename to "comment";',
    ].join('\n'),
  })
  try {
    assert.equal(cascadeProblems(cascadingPlan(), dir).length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a relationship that is not a cascade asserts nothing about the SQL', () => {
  const p = cascadingPlan()
  if (p.model.kind === 'built')
    p.model.items[0]!.relationships[0]!.onDelete = 'orphan'
  const dir = migrations({
    'sqlite/0003-entry.sql': 'create table "entry" ("id" text primary key);',
  })
  try {
    assert.deepEqual(cascadeProblems(p, dir), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

/**
 * Generated step meta for one scenario, as `pikku scenarios` writes it: nodes chained by
 * `next`, each carrying the phase and the step's resolved input.
 */
const steps = (
  name: string,
  nodes: Array<[string, string, Record<string, unknown>]>
) => {
  const built: Record<string, unknown> = {}
  nodes.forEach(([rpcName, scenarioStepPhase, input], i) => {
    built[`n${i}`] = {
      rpcName,
      scenarioStepPhase,
      input,
      ...(nodes[i + 1] ? { next: `n${i + 1}` } : {}),
    }
  })
  return { name, source: 'scenario', nodes: built, entryNodeIds: ['n0'] }
}

const opensThenRests = (name: string) =>
  steps(name, [
    ['opensPage', 'when', { path: '/app/today' }],
    ['restsOnPath', 'then', { path: '/app/today' }],
  ])

// The gap the existence check is blind to: the scenario was written, so it ticks its row
// and passes its run, while the journey it names was never driven.
test('a browser scenario that only proves the page loads is called out', () => {
  const dir = project({
    ...bothBuilt,
    'scenarios/meta/ownerWritesTodayScenario.gen.json': opensThenRests(
      'ownerWritesTodayScenario'
    ),
  })
  try {
    const { missing, problems } = planShortfall(plan(), readPikkuMeta(dir))
    assert.deepEqual(
      missing,
      [],
      'it exists — this is not an existence failure'
    )
    assert.equal(problems.length, 1)
    assert.match(problems[0]!, /ownerWritesTodayScenario/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// The same shape, honestly used. A permission scenario's whole claim is that the guard let
// this actor through (or bounced them), which is exactly what landing somewhere proves —
// judging it by the browser rule would fail the starter template's own auth scenario.
test('the identical shape is fine when the plan only claimed a permission', () => {
  const dir = project({
    ...bothBuilt,
    'scenarios/meta/anotherMemberRefusedScenario.gen.json': opensThenRests(
      'anotherMemberRefusedScenario'
    ),
  })
  try {
    assert.deepEqual(planShortfall(plan(), readPikkuMeta(dir)).problems, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a browser scenario that asserts what the user would see raises nothing', () => {
  const dir = project({
    ...bothBuilt,
    'scenarios/meta/ownerWritesTodayScenario.gen.json': steps(
      'ownerWritesTodayScenario',
      [
        ['opensPage', 'when', { path: '/app/today' }],
        ['writesEntry', 'when', { body: 'a good day' }],
        ['seesText', 'then', { text: 'a good day' }],
      ]
    ),
  })
  try {
    assert.deepEqual(planShortfall(plan(), readPikkuMeta(dir)).problems, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// The generated scopes meta nests by segment while a plan (and a function's `scopes: [...]`)
// names the colon-joined id, so reading the top-level keys alone made every nested scope
// unsatisfiable — the shape that refused run hmt2p3w7z six times for scopes codegen had
// already produced.
test('readPikkuMeta flattens nested scope ids, not just the roots', () => {
  const dir = project({
    'scopes/pikku-scopes-meta.gen.json': {
      tutor: {
        name: 'tutor',
        description: 'Tutor capabilities',
        scopes: {
          week: {
            description: 'The week',
            scopes: { read: { description: 'Read the week' } },
          },
          practice: {
            description: 'Practice',
            scopes: { manage: { description: 'Manage' } },
          },
        },
      },
      family: {
        description: 'Family',
        scopes: { practice: { description: 'Their practice' } },
      },
    },
  })
  try {
    const { scopes } = readPikkuMeta(dir)
    assert.ok(scopes.has('tutor:week:read'))
    assert.ok(scopes.has('tutor:practice:manage'))
    assert.ok(scopes.has('family:practice'))
    assert.ok(scopes.has('tutor'), 'the root is still a grantable scope')
    assert.ok(!scopes.has('read'), 'a leaf segment is not an id on its own')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// The failure this split exists for: run hmt3fz3c0's first milestone planned ten permission
// scenarios against four other items, and the union meant a deployed, rendering, signed-in
// app with 15 passing scenarios could never be marked complete.
test('a cross product of permission scenarios does not block the walking skeleton', () => {
  const crossProduct = plan()
  crossProduct.scenarios.permission = {
    kind: 'built',
    description: 'Nobody reaches anybody else.',
    items: Array.from({ length: 10 }, (_, i) => ({
      feature: 'features/perms.feature',
      scenario: `Refusal ${i}`,
      name: `refusal${i}Scenario`,
    })),
  }
  const dir = project(bothBuilt)
  try {
    const { missing, deferred } = planShortfall(
      crossProduct,
      readPikkuMeta(dir)
    )
    assert.deepEqual(missing, [])
    assert.equal(deferred.length, 10)
    assert.ok(deferred.every((d) => d.startsWith('permission scenario')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a permission scenario explicitly placed in pass 1 still blocks', () => {
  const explicit = plan()
  if (explicit.scenarios.permission.kind === 'built') {
    explicit.scenarios.permission.items[0]!.pass = 1
  }
  const dir = project({
    ...bothBuilt,
    'scenarios/pikku-scenario-functions-meta.gen.json': {
      secondEntryRefusedScenario: {},
      ownerWritesTodayScenario: {},
    },
  })
  try {
    const { missing } = planShortfall(explicit, readPikkuMeta(dir))
    assert.ok(missing.some((m) => m.includes('anotherMemberRefusedScenario')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// A plan states a wire only when the function is reached some way other than its RPC, and
// only `http` was ever checked back. So a plan could promise a scheduled task, the build
// could ship the bare function, and the gate certified the milestone complete — which is
// why `transports: ["http", "scheduler"]` was planned in run hmt7o76ws and never built.
test('a function planned on a non-http transport is missing until that transport reaches it', () => {
  const scheduled = plan()
  if (scheduled.functions.kind === 'built') {
    scheduled.functions.items[0].wire = { transport: 'scheduler' }
  }
  const dir = project({
    ...bothBuilt,
    'http/pikku-http-wirings-meta.gen.json': { GET: { '/entry': {} } },
  })
  try {
    const { missing } = planShortfall(scheduled, readPikkuMeta(dir))
    assert.deepEqual(missing, ['scheduler wire for createEntry'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a workflow meta left behind by a rename no longer discharges a wire', () => {
  const dir = project({
    ...bothBuilt,
    'workflow/meta/deletedSweep.gen.json': {
      name: 'deletedSweep',
      pikkuFuncId: 'deletedSweep',
      source: 'dsl',
      nodes: { step_0: { nodeId: 'step_0', rpcName: 'goneStep', next: null } },
    },
  })
  try {
    const wired = readPikkuMeta(dir).wired.workflow
    assert.equal(wired.has('deletedSweep'), false)
    assert.equal(wired.has('goneStep'), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a meta tree's own vocabulary is not read as a wired function", () => {
  const dir = project({
    ...bothBuilt,
    'function/pikku-functions-meta.gen.json': {
      createEntry: { auth: true },
      listEntries: { auth: true },
      nightlySweep: { auth: false },
      sweepEntries: { auth: false },
    },
    'workflow/meta/nightlySweep.gen.json': {
      name: 'nightlySweep',
      pikkuFuncId: 'nightlySweep',
      source: 'dsl',
      context: { attempts: { type: 'number', default: 1 } },
      nodes: {
        step_0: { nodeId: 'step_0', rpcName: 'sweepEntries', next: null },
      },
    },
  })
  try {
    const wired = readPikkuMeta(dir).wired.workflow
    assert.ok(wired.has('nightlySweep'))
    assert.ok(wired.has('sweepEntries'))
    for (const vocabulary of [
      'nodes',
      'source',
      'dsl',
      'context',
      'attempts',
      'number',
      'step_0',
    ]) {
      assert.equal(
        wired.has(vocabulary),
        false,
        `${vocabulary} is schema, not a function`
      )
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a scheduled task codegen recorded discharges the wire it was planned with', () => {
  const scheduled = plan()
  if (scheduled.functions.kind === 'built') {
    scheduled.functions.items[0].wire = { transport: 'scheduler' }
  }
  const dir = project({
    ...bothBuilt,
    'http/pikku-http-wirings-meta.gen.json': { GET: { '/entry': {} } },
    'scheduler/pikku-schedulers-wirings-meta.gen.json': {
      nightlyEntrySweep: {
        pikkuFuncId: 'createEntry',
        name: 'nightlyEntrySweep',
        schedule: '0 2 * * *',
      },
    },
  })
  try {
    const { missing, done } = planShortfall(scheduled, readPikkuMeta(dir))
    assert.deepEqual(missing, [])
    assert.ok(done.includes('function createEntry'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// Checked against real generated meta, not a guess at its shape: a scheduler records
// `{pikkuFuncId, name, schedule}`, a queue worker's `pikkuFuncId` can carry a namespace
// (`pikkuWorkflowOrchestrator:allWorkflow`), and a workflow is a `nodes` tree whose steps
// name the rpcs they call.
test('the shapes codegen really writes discharge the wire they were planned with', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    [
      'queue/pikku-queue-workers-wirings-meta.gen.json',
      {
        'wf-createEntry': {
          name: 'wf-createEntry',
          pikkuFuncId: 'pikkuWorkflowOrchestrator:createEntry',
        },
      },
    ],
    [
      'workflow/meta/entryWorkflow.gen.json',
      {
        name: 'entryWorkflow',
        pikkuFuncId: 'entryWorkflow',
        nodes: {
          'Write it': {
            nodeId: 'Write it',
            rpcName: 'createEntry',
            stepHash: '94d48581c462',
          },
        },
      },
    ],
  ]
  for (const [file, meta] of cases) {
    const transport = file.startsWith('queue') ? 'queue' : 'workflow'
    const wired = plan()
    if (wired.functions.kind === 'built') {
      wired.functions.items[0].wire = { transport }
    }
    const dir = project({
      ...bothBuilt,
      'http/pikku-http-wirings-meta.gen.json': { GET: { '/entry': {} } },
      [file]: meta,
    })
    try {
      const { missing } = planShortfall(wired, readPikkuMeta(dir))
      assert.deepEqual(
        missing,
        [],
        `${transport} did not discharge createEntry`
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})
