import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { ErrorCode, InspectorLogger } from '../types.js'

const silentLogger = (): InspectorLogger => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  diagnostic: () => {},
  critical: (_code: ErrorCode, _message: string) => {},
  hasCriticalErrors: () => false,
})

// A `func:` inlined into a wiring has no exported name, so addFunctions skips
// it and only the wiring's context-based id exists. The wiring visitor must
// register the function metadata under that id (via ensureInlineWiringFunction)
// or the transport resolves to nothing at runtime ("Missing generated metadata
// for ...") and, once registered, every invocation would 403 unless the
// sessionless flag is carried across from the helper used.
const WIRINGS = [
  {
    label: 'wireQueueWorker',
    wire: 'wireQueueWorker',
    props: "name: 'inline-queue',",
    expectedId: 'queue:inline-queue',
  },
  {
    label: 'wireScheduler',
    wire: 'wireScheduler',
    props: "name: 'inline-cron', schedule: '* * * * *',",
    expectedId: 'scheduler:inline-cron',
  },
  {
    label: 'wireTrigger',
    wire: 'wireTrigger',
    props: "name: 'inline-trigger',",
    expectedId: 'trigger:inline-trigger',
  },
  {
    label: 'wireGateway',
    wire: 'wireGateway',
    props: "name: 'inline-gw', type: 'slack',",
    expectedId: 'gateway:inline-gw',
  },
]

const write = (wire: string, props: string, helper: string) =>
  [
    `import { ${helper}, ${wire} } from '@pikku/core'`,
    `${wire}({`,
    `  ${props}`,
    `  func: ${helper}<{ url: string }, void>({ func: async () => {} }),`,
    '})',
  ].join('\n')

describe('inline wiring functions register metadata', () => {
  for (const { label, wire, props, expectedId } of WIRINGS) {
    test(`${label} registers a sessionless func inlined into it`, async () => {
      const rootDir = await mkdtemp(join(tmpdir(), 'pikku-inline-'))
      const file = join(rootDir, 'wire.ts')
      await writeFile(file, write(wire, props, 'pikkuSessionlessFunc'))

      try {
        const state = await inspect(silentLogger(), [file], { rootDir })
        const funcMeta = state.functions.meta[expectedId]
        assert.ok(
          funcMeta,
          `${label}: metadata must exist under the id the wiring references`
        )
        assert.equal(
          funcMeta!.sessionless,
          true,
          `${label}: pikkuSessionlessFunc must stay sessionless when inlined`
        )
      } finally {
        await rm(rootDir, { recursive: true, force: true })
      }
    })

    test(`${label} keeps an inlined pikkuFunc session-required`, async () => {
      const rootDir = await mkdtemp(join(tmpdir(), 'pikku-inline-auth-'))
      const file = join(rootDir, 'wire.ts')
      await writeFile(file, write(wire, props, 'pikkuFunc'))

      try {
        const state = await inspect(silentLogger(), [file], { rootDir })
        const funcMeta = state.functions.meta[expectedId]
        assert.ok(funcMeta, `${label}: metadata must exist`)
        assert.equal(
          funcMeta!.sessionless,
          false,
          `${label}: pikkuFunc must not be marked sessionless`
        )
      } finally {
        await rm(rootDir, { recursive: true, force: true })
      }
    })
  }
})
