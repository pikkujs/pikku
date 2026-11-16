import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { confirmDestructive, generateWithApproval } from './db-generate.js'
import type { GenerateResult } from '../db/local-db.js'

const drop = {
  kind: 'dropColumn' as const,
  table: 'note',
  column: 'legacy',
  what: 'DROP COLUMN note.legacy: its data is lost',
}

const result = (patch: Partial<GenerateResult> = {}): GenerateResult => ({
  upToDate: [],
  written: [],
  refusals: [],
  destructive: [],
  notes: [],
  ...patch,
})

describe('confirmDestructive', () => {
  test('a run nobody is watching is refused without asking', async () => {
    let asked = false
    const approved = await confirmDestructive({
      interactive: false,
      ask: async () => ((asked = true), true),
    })
    assert.equal(approved, false)
    assert.equal(asked, false)
  })

  test('on a terminal the answer decides', async () => {
    assert.equal(
      await confirmDestructive({ interactive: true, ask: async () => true }),
      true
    )
    assert.equal(
      await confirmDestructive({ interactive: true, ask: async () => false }),
      false
    )
  })
})

describe('generateWithApproval', () => {
  const file = (source: string) => ({
    source,
    file: `${source}.sql`,
    needsBackfill: [],
    orphaned: [],
  })

  test('with nothing to approve it never asks', async () => {
    let asked = false
    const { result: out, declined } = await generateWithApproval(
      async () => result({ upToDate: ['app-tables'] }),
      undefined,
      async () => ((asked = true), true)
    )
    assert.equal(asked, false)
    assert.equal(declined, false)
    assert.deepEqual(out.upToDate, ['app-tables'])
  })

  test('a yes writes what was refused and keeps what the first pass wrote', async () => {
    const calls: Array<boolean | undefined> = []
    const { result: out, declined } = await generateWithApproval(
      async (allow) => {
        calls.push(allow)
        return allow
          ? result({ written: [file('app-tables')], upToDate: ['auth'] })
          : result({
              written: [file('auth')],
              upToDate: ['runtime'],
              destructive: [drop],
            })
      },
      undefined,
      async (changes) => {
        assert.deepEqual(changes, [drop])
        return true
      }
    )
    assert.deepEqual(calls, [undefined, true])
    assert.equal(declined, false)
    assert.deepEqual(
      out.written.map((w) => w.source),
      ['auth', 'app-tables']
    )
    assert.deepEqual(out.upToDate, ['runtime'])
    assert.deepEqual(out.destructive, [])
  })

  test('a no writes nothing more and says it was declined', async () => {
    let runs = 0
    const { declined } = await generateWithApproval(
      async () => (runs++, result({ destructive: [drop] })),
      undefined,
      async () => false
    )
    assert.equal(declined, true)
    assert.equal(runs, 1)
  })

  test('a refusal beside the drop is not something a yes can fix, so nothing is asked', async () => {
    let asked = false
    const { declined, result: out } = await generateWithApproval(
      async () => result({ destructive: [drop], refusals: ['type changed'] }),
      undefined,
      async () => ((asked = true), true)
    )
    assert.equal(asked, false)
    assert.equal(declined, false)
    assert.deepEqual(out.refusals, ['type changed'])
  })
})
