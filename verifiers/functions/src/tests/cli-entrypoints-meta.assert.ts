import assert from 'node:assert/strict'
import { test } from 'node:test'
import '../../.pikku/pikku-bootstrap.gen.js'
import { pikkuState } from '@pikku/core/state'

test('the generated CLI metadata says my-cli is reached over its channel', () => {
  const program = pikkuState(null, 'cli', 'meta').programs['my-cli']
  assert.deepEqual(program?.entrypoints, [
    { type: 'channel', channel: 'my-cli-cli', route: '/cli/my-cli' },
  ])
})
