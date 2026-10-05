import assert from 'node:assert'
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { BuilderSession } from './index.js'

const fakePi = `
const rl = require('node:readline').createInterface({ input: process.stdin })
rl.on('line', (line) => {
  if (JSON.parse(line).type !== 'prompt') return
  process.stdout.write(JSON.stringify({ type: 'agent_end' }) + '\\n')
})
rl.on('close', () => process.exit(0))
`

const route = (reason: string, context: string | null) =>
  JSON.stringify({ agent: context ? 'changes' : null, skill: 'pikku-changes', refs: [], reason, context, merged: [] })

const until = async (check: () => Promise<boolean>) => {
  for (let i = 0; i < 300; i++) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('timed out')
}

describe('BuilderSession.startChanges', () => {
  test('on a tick, starts new work once and then waits for something new', async () => {
    const home = await mkdtemp(join(tmpdir(), 'pikku-builder-'))
    let context: string | null = null
    let launches = 0
    const builder = new BuilderSession(
      async () => ({
        cwd: home,
        loop: false,
        run: async () => ({ code: 0, output: route(context ? 'Open changes' : 'Nothing to do', context) }),
        launch: () => {
          launches += 1
          return spawn(process.execPath, ['-e', fakePi], { stdio: ['pipe', 'pipe', 'pipe'] })
        },
      }),
      home
    )
    const settle = () => until(async () => !(await builder.state('shop')).busy)

    assert.deepEqual(await builder.startChanges('shop', true), { started: false, reason: 'Nothing to do' })

    context = 'change 1'
    assert.equal((await builder.startChanges('shop', true)).started, true)
    await settle()
    assert.equal((await builder.startChanges('shop', true)).started, true)
    await settle()
    assert.deepEqual(await builder.startChanges('shop', true), { started: false, reason: 'No new work since the last turn' })
    assert.equal(launches, 2)

    context = 'change 1 and 2'
    assert.equal((await builder.startChanges('shop', true)).started, true)
    await settle()
    assert.equal((await builder.startChanges('shop')).started, true)
  })
})
