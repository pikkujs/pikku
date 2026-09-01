import assert from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import {
  gherkinOf,
  inMilestonesDir,
  personasIn,
  readMilestones,
  surfaceOf,
} from './milestone.js'
import { parseNote } from './notes.js'
import { MILESTONE_SCALARS } from './milestone.js'

const note = (body: string) =>
  parseNote('knowledge/milestones/01-a.md', body, MILESTONE_SCALARS)

describe('surfaceOf', () => {
  test('an unset surface is an app', () => {
    assert.equal(surfaceOf(note('---\ntype: milestone\n---\n')), 'app')
  })

  test('a surface nobody declared falls back rather than throwing', () => {
    assert.equal(
      surfaceOf(note('---\ntype: milestone\nsurface: hologram\n---\n')),
      'app'
    )
  })

  test('a declared surface is read case-insensitively', () => {
    assert.equal(
      surfaceOf(note('---\ntype: milestone\nsurface: CLI\n---\n')),
      'cli'
    )
  })
})

describe('personasIn', () => {
  test('a single-quoted subject is a persona', () => {
    assert.deepEqual(personasIn("Given 'owner' has an entry"), ['owner'])
  })

  test('a double-quoted value is the product speaking, not a person', () => {
    // Reading both quote styles as personas made a checklist item called
    // "Took my meds" a gate failure.
    assert.deepEqual(personasIn('When \'owner\' saves "Took my meds"'), [
      'owner',
    ])
  })

  test('the same persona named twice is named once', () => {
    assert.deepEqual(
      personasIn("Given 'owner' has an entry\nThen 'owner' sees it"),
      ['owner']
    )
  })
})

describe('gherkinOf', () => {
  test('a note with no fence has none', () => {
    assert.equal(gherkinOf(note('---\ntype: milestone\n---\nprose only')), null)
  })

  test('the fenced block comes back trimmed', () => {
    const body = '---\ntype: milestone\n---\n```gherkin\nGiven a thing\n```\n'
    assert.equal(gherkinOf(note(body)), 'Given a thing')
  })
})

describe('readMilestones', () => {
  test('only milestone notes under milestones/ come back, with their own scalars', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'milestone-'))
    try {
      await mkdir(join(cwd, 'knowledge/milestones'), { recursive: true })
      await mkdir(join(cwd, 'knowledge/entities'), { recursive: true })
      await writeFile(
        join(cwd, 'knowledge/milestones/01-a.md'),
        '---\ntype: milestone\nsurface: cli\n---\nbody\n'
      )
      await writeFile(
        join(cwd, 'knowledge/entities/entry.md'),
        '---\ntype: entity\n---\nbody\n'
      )
      const milestones = await readMilestones(cwd)
      assert.deepEqual(
        milestones.map((m) => m.path),
        ['knowledge/milestones/01-a.md']
      )
      assert.equal(surfaceOf(milestones[0]!), 'cli')
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})

describe('inMilestonesDir', () => {
  test('the directory itself is not a note in it', () => {
    assert.equal(inMilestonesDir('knowledge/milestones'), false)
    assert.equal(inMilestonesDir('knowledge/milestones/01-a.md'), true)
    assert.equal(inMilestonesDir('knowledge/entities/entry.md'), false)
  })
})
