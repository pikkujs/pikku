import assert from 'node:assert'
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { BuilderSession } from './index.js'

const fakePi = `
const rl = require('node:readline').createInterface({ input: process.stdin })
const out = (e) => process.stdout.write(JSON.stringify(e) + '\\n')
rl.on('line', (line) => {
  if (JSON.parse(line).type !== 'prompt') return
  out({ type: 'tool_execution_start', toolCallId: 'n1', toolName: 'navigate', args: { screen: 'workflows' } })
  out({ type: 'tool_execution_end', toolCallId: 'n1', toolName: 'navigate', result: { details: { navigate: { screen: 'workflows', id: 'sendInvoice', title: 'Open the invoice workflow' } } } })
  out({ type: 'tool_execution_start', toolCallId: 'n2', toolName: 'navigate', args: { screen: 'billing' } })
  out({ type: 'tool_execution_end', toolCallId: 'n2', toolName: 'navigate', isError: true, result: {} })
  out({ type: 'agent_end' })
})
rl.on('close', () => process.exit(0))
`

const idle = JSON.stringify({ agent: null, skill: null, refs: [], reason: 'Nothing to do', context: null, merged: [] })
const intake = (prompt: string) => JSON.stringify({ agent: 'intake', skill: 'pikku-changes', refs: [], reason: 'A request', context: prompt, merged: [] })
const run = async (_cwd: string, args: string[]) => ({ code: 0, output: args[1] === '--prompt' ? intake(args[2]!) : idle })

test('a navigate call becomes an item the app can open', async () => {
  const home = await mkdtemp(join(tmpdir(), 'pikku-builder-'))
  const builder = new BuilderSession(
    async () => ({ cwd: home, run, launch: () => spawn(process.execPath, ['-e', fakePi], { stdio: ['pipe', 'pipe', 'pipe'] }) }),
    home
  )
  await builder.prompt('shop', 'Write the invoice workflow')
  for (let i = 0; i < 300 && (await builder.state('shop')).busy; i++) await new Promise((r) => setTimeout(r, 10))
  const navigations = (await builder.state('shop')).items.filter((item) => item.kind === 'navigate')
  assert.deepEqual(
    navigations.map(({ at: _at, ...item }) => item),
    [{ kind: 'navigate', screen: 'workflows', id: 'sendInvoice', title: 'Open the invoice workflow' }]
  )
})
