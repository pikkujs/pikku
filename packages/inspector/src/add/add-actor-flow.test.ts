import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'

function makeLogger(
  criticals: Array<{ code: string; message: string }>
): InspectorLogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: ({ code, message }) => {
      criticals.push({ code, message })
    },
    critical: (code: any, message: string) => {
      criticals.push({ code, message })
    },
    hasCriticalErrors: () => criticals.length > 0,
  }
}

describe('addActorFlow — pikkuActorFlow detection', () => {
  test('extracts actor, agent, task, evaluate and verify presence', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-actor-flow-'))
    const file = join(rootDir, 'todo.actor-flow.ts')

    await writeFile(
      file,
      [
        "import { pikkuActorFlow } from '@pikku/core/workflow'",
        'declare const actors: Record<string, any>',
        'export const pmCreatesTodo = pikkuActorFlow({',
        '  actor: actors.pm,',
        "  agent: 'todoBot',",
        "  task: 'Get a todo created for the launch',",
        "  evaluate: 'A todo about the launch now exists',",
        '  verify: async ({ actor }) => {',
        "    await actor.invoke('getTodos', {})",
        '  },',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: string; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })

      const meta = state.actorFlows.meta['pmCreatesTodo']
      assert.ok(meta, 'pmCreatesTodo should be registered as an actor flow')
      assert.equal(meta.actor, 'pm')
      assert.equal(meta.agent, 'todoBot')
      assert.equal(meta.task, 'Get a todo created for the launch')
      assert.equal(meta.evaluate, 'A todo about the launch now exists')
      assert.equal(meta.hasVerify, true)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('hasVerify is false when no verify hook is declared', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-actor-flow-noverify-'))
    const file = join(rootDir, 'noverify.actor-flow.ts')

    await writeFile(
      file,
      [
        "import { pikkuActorFlow } from '@pikku/core/workflow'",
        'declare const actors: Record<string, any>',
        'export const devAsks = pikkuActorFlow({',
        '  actor: actors.dev,',
        "  agent: 'supportBot',",
        "  task: 'Ask how to configure the queue',",
        "  evaluate: 'The agent explained queue configuration',",
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: string; message: string }> = []
    try {
      const state = await inspect(makeLogger(criticals), [file], { rootDir })
      const meta = state.actorFlows.meta['devAsks']
      assert.ok(meta, 'devAsks should be registered as an actor flow')
      assert.equal(meta.actor, 'dev')
      assert.equal(meta.hasVerify ?? false, false)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
