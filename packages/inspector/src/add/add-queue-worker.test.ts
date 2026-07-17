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

describe('addQueueWorker inline functions', () => {
  test('registers function metadata for a func inlined into wireQueueWorker', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-inline-queue-'))
    const file = join(rootDir, 'worker.ts')

    await writeFile(
      file,
      [
        "import { pikkuSessionlessFunc, wireQueueWorker } from '@pikku/core'",
        'wireQueueWorker({',
        "  name: 'inline-queue',",
        '  func: pikkuSessionlessFunc<{ url: string }, void>({',
        '    func: async () => {},',
        '  }),',
        '})',
      ].join('\n')
    )

    try {
      const state = await inspect(silentLogger(), [file], { rootDir })

      const worker = state.queueWorkers.meta['inline-queue']
      assert.ok(worker, 'the queue worker should be registered')

      // The wiring points at a context-based id because an inline func has no
      // exported name. Without metadata under that id the runtime fails with
      // "Missing generated metadata for queue worker".
      assert.equal(worker!.pikkuFuncId, 'queue:inline-queue')
      const funcMeta = state.functions.meta[worker!.pikkuFuncId]
      assert.ok(
        funcMeta,
        'the inlined func must have metadata under the id the wiring references'
      )

      // Without this the worker is treated as session-required and every job
      // fails with "Authentication required".
      assert.equal(
        funcMeta!.sessionless,
        true,
        'pikkuSessionlessFunc must stay sessionless when inlined'
      )
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('an inlined pikkuFunc stays session-required', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-inline-queue-auth-'))
    const file = join(rootDir, 'worker.ts')

    await writeFile(
      file,
      [
        "import { pikkuFunc, wireQueueWorker } from '@pikku/core'",
        'wireQueueWorker({',
        "  name: 'session-queue',",
        '  func: pikkuFunc<{ url: string }, void>({',
        '    func: async () => {},',
        '  }),',
        '})',
      ].join('\n')
    )

    try {
      const state = await inspect(silentLogger(), [file], { rootDir })
      const funcMeta = state.functions.meta['queue:session-queue']
      assert.ok(funcMeta)
      assert.equal(funcMeta!.sessionless, false)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
