import assert from 'node:assert'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import {
  dispatchedMilestone,
  firstPersonStep,
  holdMilestoneLifecycle,
  markDispatchedMilestoneBuilt,
  nominatedMilestone,
  quotedIn,
  setMilestoneStatus,
} from './milestone.js'

let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'milestone-'))
  mkdirSync(join(cwd, 'knowledge', 'milestones'), { recursive: true })
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

const milestone = (name: string, frontmatter: string[], body = 'A piece of work.') => {
  const path = `knowledge/milestones/${name}`
  writeFileSync(
    join(cwd, path),
    `---\ntype: milestone\n${frontmatter.join('\n')}\n---\n\n${body}\n`
  )
  return path
}

describe('gherkin lints', () => {
  test('a first-person step is found and quoted back', () => {
    const step = firstPersonStep(
      ["Given 'owner' has an account", 'When I open the page'].join('\n')
    )
    assert.equal(step, 'When I open the page')
  })

  test('a double-quoted domain value is not scenario voice', () => {
    assert.equal(
      firstPersonStep('Then the list shows "Took my meds"'),
      null
    )
  })

  test('a persona named mid-sentence is still collected', () => {
    assert.deepEqual(
      quotedIn("Given 'member' has borrowed a drill and 'member2' has a hammer"),
      ['member', 'member2']
    )
  })

  test("the product's own words are never read as a person", () => {
    assert.deepEqual(quotedIn('Given the entry is called "Tonight"'), [])
  })
})

describe('the milestone lifecycle', () => {
  test('a status move stamps when it happened', async () => {
    const path = milestone('01-tonight.md', ['status: proposed'])
    setMilestoneStatus(cwd, path, 'dispatched')
    const raw = readFileSync(join(cwd, path), 'utf8')
    assert.match(raw, /status: dispatched/)
    assert.match(raw, /statusAt: \d{4}-\d{2}-\d{2}T/)
  })

  test('a note that was never `proposed` cannot be moved', () => {
    const path = milestone('01-tonight.md', ['title: Tonight'])
    assert.throws(
      () => setMilestoneStatus(cwd, path, 'dispatched'),
      /no `status:` line/
    )
  })

  test('exactly one dispatched milestone is marked built', async () => {
    milestone('01-tonight.md', ['status: dispatched'])
    const built = await markDispatchedMilestoneBuilt(cwd)
    assert.equal(built?.path, 'knowledge/milestones/01-tonight.md')
    assert.equal(await dispatchedMilestone(cwd), null)
  })

  test('two dispatched milestones mark nothing, so the queue repeats rather than loses one', async () => {
    milestone('01-tonight.md', ['status: dispatched'])
    milestone('02-this-week.md', ['status: dispatched'])
    assert.equal(await markDispatchedMilestoneBuilt(cwd), null)
    assert.equal(await dispatchedMilestone(cwd), null)
  })

  test('a status reverted by a turn that rewrites notes is restored', async () => {
    const path = milestone('01-tonight.md', ['status: dispatched'])
    const release = await holdMilestoneLifecycle(cwd)

    writeFileSync(
      join(cwd, path),
      '---\ntype: milestone\nstatus: proposed\n---\n\nRe-filed from a later answer.\n'
    )
    await release()

    const raw = readFileSync(join(cwd, path), 'utf8')
    assert.match(raw, /status: dispatched/)
    assert.match(raw, /Re-filed from a later answer/)
  })
})

describe('nominatedMilestone', () => {
  test('matches an unbuilt milestone by title or slug', async () => {
    milestone('01-the-daily-entry.md', ['status: proposed', 'title: The daily entry'])
    assert.equal(
      (await nominatedMilestone(cwd, 'daily entry'))?.title,
      'The daily entry'
    )
    assert.equal(
      (await nominatedMilestone(cwd, 'The Daily Entry!'))?.title,
      'The daily entry'
    )
  })

  test('never nominates one that is already built, or a name matching nothing', async () => {
    milestone('01-the-daily-entry.md', ['status: built', 'title: The daily entry'])
    assert.equal(await nominatedMilestone(cwd, 'daily entry'), null)
    assert.equal(await nominatedMilestone(cwd, ''), null)
  })
})
