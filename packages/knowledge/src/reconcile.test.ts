import assert from 'node:assert'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { recordNoteAttempt, setNoteScalars } from './ledger.js'
import { readMilestones } from './milestone.js'
import { basePlan } from './plan-fixture.js'
import { writePlan } from './plan.js'
import {
  MAX_ATTEMPTS,
  SEATS,
  nextAction,
  runKnowledgeReconcile,
} from './reconcile.js'

let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'reconcile-'))
  mkdirSync(join(cwd, 'knowledge', 'milestones'), { recursive: true })
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

const GHERKIN = [
  '```gherkin',
  "Given 'owner' has no entry for today",
  "When 'owner' writes one",
  '```',
].join('\n')

const milestone = (
  name = '01-the-daily-entry.md',
  frontmatter: Record<string, string> = {}
) => {
  const keys = {
    type: 'milestone',
    title: 'The daily entry',
    status: 'proposed',
    entities: 'entry',
    ...frontmatter,
  }
  const fence = Object.entries(keys)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
  writeFileSync(
    join(cwd, 'knowledge/milestones', name),
    `---\n${fence}\n---\n\n${GHERKIN}\n`
  )
  return `knowledge/milestones/${name}`
}

/**
 * Spend a seat's whole budget against the note as it now stands.
 *
 * `profileScalars` has to match what the reader will pass: an attempt is recorded
 * against a fingerprint taken over the keys the CALLER names, so burning under one
 * profile and reading under another compares two different notes and asserts nothing.
 */
const burn = async (
  path: string,
  seat: string,
  profileScalars: readonly string[] = []
) => {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const note = (await readMilestones(cwd, profileScalars)).find(
      (n) => n.path === path
    )!
    recordNoteAttempt(cwd, note, seat, { profileScalars })
  }
}

/** Replace a note's body, leaving its frontmatter — the ledger included — alone. */
const rewriteBody = (path: string, body: string) => {
  const raw = readFileSync(join(cwd, path), 'utf8')
  const fence = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(raw)![0]
  writeFileSync(join(cwd, path), `${fence}\n${body}\n`)
}

describe('nextAction', () => {
  test('idles on an empty knowledge base', async () => {
    const action = await nextAction(cwd)
    assert.equal(action.kind, 'idle')
    assert.match(
      action.kind === 'idle' ? action.why : '',
      /nothing is written down yet/
    )
  })

  test('a dispatched milestone is the whole answer', async () => {
    milestone('01-the-daily-entry.md', { status: 'dispatched' })
    milestone('02-the-week.md')
    const action = await nextAction(cwd)
    assert.equal(action.kind, 'idle')
    assert.match(
      action.kind === 'idle' ? action.why : '',
      /01-the-daily-entry\.md is building/
    )
  })

  test('a malformed note is repaired first, then asked about, then rests', async () => {
    const path = milestone('01-the-daily-entry.md', { entities: '' })

    const repair = await nextAction(cwd)
    assert.equal(repair.kind, 'repair-note')
    assert.match(
      repair.kind === 'repair-note' ? repair.reason : '',
      /no `entities:`/
    )

    await burn(path, SEATS.author)
    const ask = await nextAction(cwd)
    assert.equal(ask.kind, 'ask-user')

    await burn(path, SEATS.user)
    const rest = await nextAction(cwd)
    assert.equal(rest.kind, 'idle')
    assert.match(
      rest.kind === 'idle' ? rest.why : '',
      /cannot be repaired and the user has been asked/
    )
  })

  test("the author's budget is spent across every body the note has had", async () => {
    const path = milestone('01-the-daily-entry.md', { entities: '' })
    await burn(path, SEATS.author)
    assert.equal((await nextAction(cwd)).kind, 'ask-user')

    // A rewrite that leaves the missing `entities:` exactly as it was must not hand the
    // author its budget back — that is the loop this counts across bodies to stop.
    rewriteBody(path, `Rewritten prose.\n\n${GHERKIN}`)
    assert.equal((await nextAction(cwd)).kind, 'ask-user')
  })

  test('a ready milestone with no plan goes to the planner, then to the user', async () => {
    const path = milestone()

    const plan = await nextAction(cwd)
    assert.equal(plan.kind, 'write-plan')
    assert.match(plan.kind === 'write-plan' ? plan.reason : '', /No plan at/)

    await burn(path, SEATS.planner)
    assert.equal((await nextAction(cwd)).kind, 'ask-user')

    await burn(path, SEATS.user)
    const rest = await nextAction(cwd)
    assert.equal(rest.kind, 'idle')
    assert.match(
      rest.kind === 'idle' ? rest.why : '',
      /no plan the planner could write/
    )
  })

  test('a ready milestone with a plan dispatches', async () => {
    const path = milestone()
    writePlan(cwd, path, basePlan(path))
    const action = await nextAction(cwd)
    assert.equal(action.kind, 'dispatch')
    assert.equal(action.kind === 'dispatch' ? action.note.path : '', path)
  })

  test("a profile's hold is returned rather than swallowed as idle", async () => {
    const path = milestone()
    const action = await nextAction(cwd, {
      gate: async (_cwd, note) => ({
        ok: false,
        reason: 'Not dispatched: nobody has agreed the screen yet.',
        awaiting: { hold: 'screens', notes: [note] },
      }),
    })
    assert.equal(action.kind, 'hold')
    assert.equal(action.kind === 'hold' ? action.hold : '', 'screens')
    assert.deepEqual(
      action.kind === 'hold' ? action.notes.map((n) => n.path) : [],
      [path]
    )
  })

  test('a repair to a profile key refunds a per-body budget when the profile names it', async () => {
    const path = milestone()
    const scalars = ['design'] as const
    const next = () => nextAction(cwd, { profileScalars: scalars })

    await burn(path, SEATS.planner, scalars)
    assert.equal((await next()).kind, 'ask-user')

    // Reading again with nothing changed must NOT hand the budget back, or the refund
    // below is only the fingerprint being unstable.
    assert.equal((await next()).kind, 'ask-user')

    // The planner is counted against the body it is answering, and `design:` belongs to
    // a profile — so the note only reads as having moved for a caller that names it.
    setNoteScalars(cwd, path, { design: 'the picked one' })
    assert.equal(
      (await next()).kind,
      'write-plan',
      'the key the profile named moved, so the planner gets another go'
    )
  })
})

describe('runKnowledgeReconcile', () => {
  test('flattens the action to paths a driver on the other side of a command can read', async () => {
    const path = milestone()
    writePlan(cwd, path, basePlan(path))
    assert.deepEqual(await runKnowledgeReconcile(cwd), {
      kind: 'dispatch',
      reason: `${path} has a plan and is ready to build`,
      note: path,
    })

    rmSync(join(cwd, path.replace(/\.md$/, '.plan.json')))
    const plan = await runKnowledgeReconcile(cwd)
    assert.equal(plan.kind, 'write-plan')
    assert.equal(plan.note, path)

    const held = await runKnowledgeReconcile(
      cwd,
      {},
      {
        gate: async (_cwd, note) => ({
          ok: false,
          reason: 'Not dispatched: nobody has agreed the screen yet.',
          awaiting: { hold: 'screens', notes: [note] },
        }),
      }
    )
    assert.equal(held.kind, 'hold')
    assert.equal(held.hold, 'screens')
    assert.deepEqual(held.notes, [path])
    assert.equal(held.note, undefined)
  })

  test('an idle action carries its why as the reason', async () => {
    const result = await runKnowledgeReconcile(cwd)
    assert.equal(result.kind, 'idle')
    assert.match(result.reason, /nothing is written down yet/)
    assert.equal(result.note, undefined)
  })
})
