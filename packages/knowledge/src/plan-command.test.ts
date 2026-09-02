import assert from 'node:assert'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { basePlan } from './plan-fixture.js'
import {
  runKnowledgePlanDefer,
  runKnowledgePlanProgress,
  runKnowledgePlanSchema,
  runKnowledgePlanSet,
  runKnowledgePlanShow,
} from './plan-command.js'

const MILESTONE = 'knowledge/milestones/01-the-daily-entry.md'

const NOTE = `---
type: milestone
entities: entry
---
The daily entry.

\`\`\`gherkin
Given 'owner' has today free
When 'owner' writes an entry
Then 'owner' reads it back
\`\`\`
`

const project = async (): Promise<string> => {
  const cwd = await mkdtemp(join(tmpdir(), 'plan-cmd-'))
  await mkdir(join(cwd, 'knowledge/milestones'), { recursive: true })
  await mkdir(join(cwd, 'knowledge/entities'), { recursive: true })
  await writeFile(join(cwd, MILESTONE), NOTE)
  // No trailing newline: the body has to hash to exactly what `basePlan` claims in its
  // `covers`, and `plan set` now refuses a hash that is not the note's current one.
  await writeFile(
    join(cwd, 'knowledge/entities/entry.md'),
    '---\ntype: entity\n---\nentry body'
  )
  return cwd
}

const planFile = async (cwd: string, plan: unknown): Promise<string> => {
  const file = join(cwd, 'draft.json')
  await writeFile(file, JSON.stringify(plan))
  return file
}

describe('plan schema', () => {
  test('the schema comes back as JSON Schema, not as prose about it', () => {
    const { schema } = runKnowledgePlanSchema()
    const parsed = JSON.parse(schema)
    assert.ok(parsed.properties.version)
    assert.ok(parsed.properties.scenarios)
  })
})

describe('plan set', () => {
  test('a plan that holds against its milestone is written', async () => {
    const cwd = await project()
    try {
      const result = await runKnowledgePlanSet(cwd, {
        milestone: '01-the-daily-entry',
        file: await planFile(cwd, basePlan()),
      })
      assert.deepEqual(result.problems, [])
      assert.equal(result.ok, true)
      assert.equal(
        result.path,
        'knowledge/milestones/01-the-daily-entry.plan.json'
      )
      const written = JSON.parse(await readFile(join(cwd, result.path), 'utf8'))
      assert.equal(written.milestone, MILESTONE)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test('the milestone can be named by path as well as by id', async () => {
    const cwd = await project()
    try {
      const result = await runKnowledgePlanSet(cwd, {
        milestone: MILESTONE,
        file: await planFile(cwd, basePlan()),
      })
      assert.equal(result.ok, true)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test('a plan that fails a check writes NOTHING', async () => {
    // The whole property: the only writer validates, so a plan cannot reach disk
    // unvalidated and a gate cannot be the first thing to read it.
    const cwd = await project()
    try {
      const plan = basePlan()
      plan.ui = { kind: 'n/a', description: 'Later.' }
      const result = await runKnowledgePlanSet(cwd, {
        milestone: '01-the-daily-entry',
        file: await planFile(cwd, plan),
      })
      assert.equal(result.ok, false)
      assert.match(result.problems.join('\n'), /no `ui` item/)
      await assert.rejects(() => readFile(join(cwd, result.path), 'utf8'))
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test('a shape refusal carries the schema, so the writer does not go looking', async () => {
    const cwd = await project()
    try {
      const plan = basePlan() as unknown as Record<string, unknown>
      delete plan.covers
      const result = await runKnowledgePlanSet(cwd, {
        milestone: '01-the-daily-entry',
        file: await planFile(cwd, plan),
      })
      assert.equal(result.ok, false)
      assert.match(result.problems.join('\n'), /covers/)
      assert.ok(result.schema)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  // `hash` is the only thing making coverage a claim about CONTENT. Nothing else checks
  // it — `knowledgeCoverage` compares it much later, where a hash that was never right is
  // indistinguishable from a note somebody edited since, so the note quietly reads as
  // backlog from the moment the milestone ships.
  test("a covers hash that is not the note's current one is refused, and the right one is named", async () => {
    const cwd = await project()
    try {
      const plan = basePlan()
      plan.covers[0]!.hash = 'deadbeefcafe'
      const result = await runKnowledgePlanSet(cwd, {
        milestone: '01-the-daily-entry',
        file: await planFile(cwd, plan),
      })
      assert.equal(result.ok, false)
      assert.equal(result.problems.length, 1)
      assert.match(result.problems[0]!, /hashes to `[0-9a-f]{12}`/)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test('a covers entry naming a note nobody wrote is refused', async () => {
    const cwd = await project()
    try {
      const plan = basePlan()
      plan.covers[0]!.note = 'entities/nothing.md'
      const result = await runKnowledgePlanSet(cwd, {
        milestone: '01-the-daily-entry',
        file: await planFile(cwd, plan),
      })
      assert.equal(result.ok, false)
      assert.match(result.problems.join('\n'), /no knowledge note at/)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  // The reader returns `knowledge/entities/entry.md` and plans are written both ways, so
  // the prefix must not be the thing that decides whether a note is found.
  test('a covers entry may name the note with or without its knowledge/ prefix', async () => {
    const cwd = await project()
    try {
      const plan = basePlan()
      plan.covers[0]!.note = 'knowledge/entities/entry.md'
      const result = await runKnowledgePlanSet(cwd, {
        milestone: '01-the-daily-entry',
        file: await planFile(cwd, plan),
      })
      assert.equal(result.ok, true, result.problems.join('\n'))
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test('a milestone nobody wrote is said so, not guessed at', async () => {
    const cwd = await project()
    try {
      const result = await runKnowledgePlanSet(cwd, {
        milestone: '99-nothing',
        file: await planFile(cwd, basePlan()),
      })
      assert.equal(result.ok, false)
      assert.match(result.problems[0]!, /No milestone note matching/)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})

describe('plan show', () => {
  test('without --for-build it is the document as stored', async () => {
    const cwd = await project()
    try {
      await runKnowledgePlanSet(cwd, {
        milestone: '01-the-daily-entry',
        file: await planFile(cwd, basePlan()),
      })
      const shown = await runKnowledgePlanShow(cwd, {
        milestone: '01-the-daily-entry',
      })
      assert.equal(shown.ok, true)
      assert.equal(JSON.parse(shown.body).milestone, MILESTONE)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test('--for-build is the same plan rendered for a reader', async () => {
    const cwd = await project()
    try {
      await runKnowledgePlanSet(cwd, {
        milestone: '01-the-daily-entry',
        file: await planFile(cwd, basePlan()),
      })
      const shown = await runKnowledgePlanShow(cwd, {
        milestone: '01-the-daily-entry',
        forBuild: true,
      })
      assert.equal(shown.ok, true)
      assert.match(shown.body, /createEntry/)
      assert.throws(() => JSON.parse(shown.body))
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test('a milestone with no plan says so rather than showing nothing', async () => {
    const cwd = await project()
    try {
      const shown = await runKnowledgePlanShow(cwd, {
        milestone: '01-the-daily-entry',
      })
      assert.equal(shown.ok, false)
      assert.match(shown.body, /No plan at/)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})

describe('plan defer', () => {
  test('a deferred item is recorded with its reason and the plan is rewritten', async () => {
    const cwd = await project()
    try {
      await runKnowledgePlanSet(cwd, {
        milestone: '01-the-daily-entry',
        file: await planFile(cwd, basePlan()),
      })
      const result = await runKnowledgePlanDefer(cwd, {
        milestone: '01-the-daily-entry',
        item: 'function:createEntry',
        reason: 'The table it writes is not migrated yet.',
      })
      assert.equal(result.ok, true)
      const written = JSON.parse(await readFile(join(cwd, result.path), 'utf8'))
      assert.equal(written.deferrals.length, 1)
      assert.match(written.deferrals[0].why, /not migrated/)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test('an item the plan does not have is refused', async () => {
    const cwd = await project()
    try {
      await runKnowledgePlanSet(cwd, {
        milestone: '01-the-daily-entry',
        file: await planFile(cwd, basePlan()),
      })
      const result = await runKnowledgePlanDefer(cwd, {
        milestone: '01-the-daily-entry',
        item: 'function:noSuchThing',
        reason: 'Because.',
      })
      assert.equal(result.ok, false)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})

/** The generated meta a build would leave behind having written everything `basePlan` promises. */
const GENERATED = {
  'function/pikku-functions-meta.gen.json': { createEntry: { auth: true } },
  'http/pikku-http-wirings-meta.gen.json': { POST: { '/entry': {} } },
  'scenarios/pikku-scenario-functions-meta.gen.json': {
    secondEntryRefusedScenario: {},
    ownerWritesTodayScenario: {},
    anotherMemberRefusedScenario: {},
  },
}

const generate = async (
  cwd: string,
  files: Record<string, unknown>
): Promise<void> => {
  for (const [rel, body] of Object.entries(files)) {
    const full = join(cwd, '.pikku', rel)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, JSON.stringify(body))
  }
}

const planned = async (cwd: string): Promise<void> => {
  const result = await runKnowledgePlanSet(cwd, {
    milestone: '01-the-daily-entry',
    file: await planFile(cwd, basePlan()),
  })
  assert.equal(result.ok, true, result.problems.join('\n'))
}

// The whole point of the command: a milestone closes on what codegen can SEE, so an agent
// that says it is finished having written nothing is refused by a check it cannot edit.
describe('plan progress', () => {
  test('a milestone whose plan is unbuilt is refused, and says what is owed', async () => {
    const cwd = await project()
    try {
      await planned(cwd)
      const result = await runKnowledgePlanProgress(cwd, {
        milestone: '01-the-daily-entry',
      })
      assert.equal(result.ok, false)
      assert.ok(result.missing.includes('function createEntry'))
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test('a milestone whose first pass exists in the meta is complete', async () => {
    const cwd = await project()
    try {
      await planned(cwd)
      await generate(cwd, GENERATED)
      const result = await runKnowledgePlanProgress(cwd, {
        milestone: '01-the-daily-entry',
      })
      assert.equal(result.ok, true, result.missing.join('\n'))
      assert.deepEqual(result.missing, [])
      assert.ok(result.done.includes('function createEntry'))
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  // The way OUT of a refusal, and the only one: an item that is not going to land moves to
  // the next pass with its reason on the record, rather than being quietly dropped.
  test('an item deferred out of the first pass stops blocking and is reported instead', async () => {
    const cwd = await project()
    try {
      await planned(cwd)
      await generate(cwd, {
        'scenarios/pikku-scenario-functions-meta.gen.json':
          GENERATED['scenarios/pikku-scenario-functions-meta.gen.json'],
      })
      await runKnowledgePlanDefer(cwd, {
        milestone: '01-the-daily-entry',
        item: 'function:createEntry',
        reason: 'The table it writes is not migrated yet.',
      })
      const result = await runKnowledgePlanProgress(cwd, {
        milestone: '01-the-daily-entry',
      })
      assert.deepEqual(result.missing, [])
      assert.ok(result.deferred.includes('function createEntry'))
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test('a milestone with no plan is refused rather than reported as complete', async () => {
    const cwd = await project()
    try {
      const result = await runKnowledgePlanProgress(cwd, {
        milestone: '01-the-daily-entry',
      })
      assert.equal(result.ok, false)
      assert.notEqual(result.message, '')
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
