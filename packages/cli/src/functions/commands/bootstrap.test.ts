import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bootstrap } from './bootstrap.js'

test('bootstrap writes the error types before anything imports them', async () => {
  const invoked: string[] = []
  await bootstrap.func(
    {
      logger: { hasCriticalErrors: () => false },
      getInspectorState: async () => {},
    } as any,
    undefined as any,
    { rpc: { invoke: async (name: string) => invoked.push(name) } } as any
  )
  assert.ok(invoked.includes('pikkuErrorTypes'))
  assert.ok(
    invoked.indexOf('pikkuErrorTypes') <
      invoked.indexOf('pikkuFunctionTypesSplit')
  )
})
