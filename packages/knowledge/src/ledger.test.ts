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
import { readKnowledgeNotes } from './notes.js'
import {
  attemptsSpent,
  noteAttempts,
  recordNoteAttempt,
  setNoteScalars,
} from './ledger.js'

let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'ledger-'))
  mkdirSync(join(cwd, 'knowledge', 'milestones'), { recursive: true })
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
})

const PATH = 'knowledge/milestones/01-tonight.md'

const write = (frontmatter: string, body = 'What is on this page.') => {
  writeFileSync(join(cwd, PATH), `---\n${frontmatter}\n---\n\n${body}\n`)
}

/** The note, read back with a profile key alongside this package's own. */
const read = async (profileScalars: readonly string[] = []) =>
  (await readKnowledgeNotes(cwd, profileScalars as string[]))[0]!

describe('setNoteScalars', () => {
  test('replaces a key that is there and appends one that is not', async () => {
    write(['type: milestone', 'status: proposed'].join('\n'))
    setNoteScalars(cwd, PATH, {
      status: 'dispatched',
      attempts: 'plan@abc123',
    })
    const note = await read()
    assert.equal(note.status, 'dispatched')
    assert.equal(note.attempts, 'plan@abc123')
    assert.match(note.body, /What is on this page/)
  })

  test('removes a key on null and refuses a note with no frontmatter', () => {
    write(['type: milestone', 'attempts: plan@abc'].join('\n'))
    setNoteScalars(cwd, PATH, { attempts: null })
    assert.doesNotMatch(readFileSync(join(cwd, PATH), 'utf8'), /attempts:/)

    writeFileSync(join(cwd, 'knowledge/milestones/bare.md'), 'no frontmatter\n')
    assert.throws(
      () => setNoteScalars(cwd, 'knowledge/milestones/bare.md', { status: 'x' }),
      /no frontmatter block/
    )
  })

  test('`require` refuses to write a lifecycle key onto a note that never had one', () => {
    write(['type: milestone'].join('\n'))
    assert.throws(
      () => setNoteScalars(cwd, PATH, { status: 'dispatched' }, ['status']),
      /no `status:` line/
    )
  })
})

describe('the attempt ledger', () => {
  test('an attempt is spent against the body it was made against, and a rewrite refunds it', async () => {
    write(['type: milestone', 'status: proposed'].join('\n'))
    assert.equal(attemptsSpent(await read(), 'architect'), 0)

    recordNoteAttempt(cwd, await read(), 'architect')
    recordNoteAttempt(cwd, await read(), 'architect')
    let note = await read()
    assert.equal(attemptsSpent(note, 'architect'), 2)
    assert.equal(attemptsSpent(note, 'knowledge'), 0)

    write(
      ['type: milestone', 'status: proposed', `attempts: ${note.attempts}`].join(
        '\n'
      ),
      'They answered, so the note now says something else.'
    )
    note = await read()
    assert.equal(attemptsSpent(note, 'architect'), 0)
    assert.equal(noteAttempts(note).length, 2)
  })

  test('the log is capped so a note nothing can satisfy cannot grow without bound', async () => {
    write(['type: milestone', 'status: proposed'].join('\n'))
    for (let i = 0; i < 12; i++) {
      recordNoteAttempt(cwd, await read(), 'architect', { cap: 4 })
    }
    assert.equal(noteAttempts(await read()).length, 4)
  })

  test('a repair that lands on the frontmatter refunds the attempt', async () => {
    write(['type: milestone', 'status: proposed'].join('\n'))
    recordNoteAttempt(cwd, await read(), 'knowledge')
    recordNoteAttempt(cwd, await read(), 'knowledge')
    assert.equal(attemptsSpent(await read(), 'knowledge'), 2)

    setNoteScalars(cwd, PATH, { entities: 'entry' })
    assert.equal(attemptsSpent(await read(), 'knowledge'), 0)
  })

  test('a repair to a profile key refunds the attempt when the profile names it', async () => {
    const profile = ['screens']
    write(['type: milestone', 'status: proposed'].join('\n'))
    recordNoteAttempt(cwd, await read(profile), 'knowledge', {
      profileScalars: profile,
    })
    assert.equal(
      attemptsSpent(await read(profile), 'knowledge', {
        profileScalars: profile,
      }),
      1
    )

    setNoteScalars(cwd, PATH, { screens: 'tonight' })
    assert.equal(
      attemptsSpent(await read(profile), 'knowledge', {
        profileScalars: profile,
      }),
      0
    )
  })

  test('a key no profile names leaves the budget alone', async () => {
    write(['type: milestone', 'status: proposed'].join('\n'))
    recordNoteAttempt(cwd, await read(), 'knowledge')
    assert.equal(attemptsSpent(await read(), 'knowledge'), 1)

    setNoteScalars(cwd, PATH, { screens: 'tonight' })
    assert.equal(attemptsSpent(await read(), 'knowledge'), 1)
  })

  test('anyBody counts attempts made against every earlier reading', async () => {
    write(['type: milestone', 'status: proposed'].join('\n'))
    recordNoteAttempt(cwd, await read(), 'plan')
    const note = await read()
    write(
      ['type: milestone', 'status: proposed', `attempts: ${note.attempts}`].join(
        '\n'
      ),
      'Re-filed by the seat waiting on a person.'
    )
    assert.equal(attemptsSpent(await read(), 'plan'), 0)
    assert.equal(attemptsSpent(await read(), 'plan', { anyBody: true }), 1)
  })
})
