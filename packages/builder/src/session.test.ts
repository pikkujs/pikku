import assert from 'node:assert'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { BuilderSession, piArgs, piEnv, writeSkills } from './index.js'

const fakePi = `
const rl = require('node:readline').createInterface({ input: process.stdin })
const out = (e) => process.stdout.write(JSON.stringify(e) + '\\n')
rl.on('line', (line) => {
  const cmd = JSON.parse(line)
  if (cmd.type !== 'prompt') return
  out({ type: 'agent_start' })
  out({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Adding ' } })
  out({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'a page.' } })
  out({ type: 'tool_execution_start', toolCallId: 't1', toolName: 'write', args: { path: 'src/home.tsx' } })
  out({ type: 'tool_execution_end', toolCallId: 't1', toolName: 'write' })
  out({ type: 'agent_end' })
})
rl.on('close', () => process.exit(0))
`

const idle = JSON.stringify({ agent: null, skill: null, refs: [], reason: 'Nothing to do', context: null, merged: [] })
const intake = (prompt: string) => JSON.stringify({ agent: 'intake', skill: 'pikku-changes', refs: [], reason: 'A request', context: prompt, merged: [] })
const run = async (_cwd: string, args: string[]) => ({ code: 0, output: args[2] === '--prompt' ? intake(args[3]!) : idle })

const until = async (check: () => Promise<boolean>) => {
  for (let i = 0; i < 300; i++) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('timed out')
}

describe('BuilderSession', () => {
  test('runs a turn and keeps the transcript', async () => {
    const home = await mkdtemp(join(tmpdir(), 'pikku-builder-'))
    let seen: string[] = []
    const builder = new BuilderSession(
      async () => ({
        cwd: home,
        run,
        launch: (_command, args) => {
          seen = args
          return spawn(process.execPath, ['-e', fakePi], { stdio: ['pipe', 'pipe', 'pipe'] })
        },
      }),
      home
    )
    await builder.prompt('shop', 'Add a home page')
    await until(async () => !(await builder.state('shop')).busy)
    const { items } = await new BuilderSession(async () => ({ cwd: home }), home).state('shop')
    assert.deepEqual(
      items.map((i) => [i.kind, 'text' in i ? i.text : `${i.name} ${i.summary} ${i.status}`]),
      [
        ['user', 'Add a home page'],
        ['assistant', 'Adding a page.'],
        ['tool', 'write src/home.tsx done'],
      ]
    )
    assert.ok(seen.includes('--mode') && seen.includes('--session-id'))
  })

  test('says why the builder stopped', async () => {
    const home = await mkdtemp(join(tmpdir(), 'pikku-builder-'))
    const builder = new BuilderSession(
      async () => ({
        cwd: home,
        run,
        launch: () =>
          spawn(process.execPath, ['-e', 'console.error("No API key for openai"); process.exit(1)'], {
            stdio: ['pipe', 'pipe', 'pipe'],
          }),
      }),
      home
    )
    await builder.prompt('shop', 'Hello')
    await until(async () => !(await builder.state('shop')).busy)
    const last = (await builder.state('shop')).items.at(-1)
    assert.equal(last?.kind, 'error')
    assert.match(last && 'text' in last ? last.text : '', /No API key/)
  })

  test('hands pi the pikku skills, the edit tools and the chosen model', async () => {
    const home = await mkdtemp(join(tmpdir(), 'pikku-builder-'))
    const skills = await writeSkills(home)
    assert.ok(existsSync(join(skills, 'pikku-build', 'SKILL.md')))
    assert.ok(!existsSync(join(skills, 'pikku-fabric')))
    const args = piArgs({ skills, ai: { provider: 'gemini', model: 'gemini-2.5-flash-lite' } })
    assert.deepEqual(args.slice(-4), ['--provider', 'google', '--model', 'gemini-2.5-flash-lite'])
    for (const path of args.filter((_, i) => args[i - 1] === '-e')) assert.ok(existsSync(path), path)
    const proxied = { model: 'gemini-flash-lite-latest', proxy: { url: 'https://llm.example/v1', key: 'k' } }
    assert.deepEqual(piArgs({ skills, ai: proxied }).slice(-4), ['--provider', 'pikku-proxy', '--model', 'gemini-flash-lite-latest'])
    assert.equal(piEnv(proxied).PIKKU_BUILDER_PROXY_MODEL, 'gemini-flash-lite-latest')
  })

  test('a new conversation keeps the old one to come back to', async () => {
    const home = await mkdtemp(join(tmpdir(), 'pikku-builder-'))
    const builder = new BuilderSession(
      async () => ({ cwd: home, run, launch: () => spawn(process.execPath, ['-e', fakePi], { stdio: ['pipe', 'pipe', 'pipe'] }) }),
      home
    )
    await builder.prompt('shop', 'Add a home page')
    await until(async () => !(await builder.state('shop')).busy)
    const first = (await builder.state('shop')).session
    await builder.clear('shop')
    await builder.prompt('shop', 'Make it blue')
    await until(async () => !(await builder.state('shop')).busy)
    assert.deepEqual(
      (await builder.conversations('shop')).map((c) => [c.title, c.current]),
      [
        ['Make it blue', true],
        ['Add a home page', false],
      ]
    )
    const resumed = await builder.resume('shop', first)
    assert.equal(resumed.session, first)
    assert.equal((resumed.items[0] as { text: string }).text, 'Add a home page')
    assert.deepEqual((await builder.conversations('shop')).map((c) => [c.title, c.current]), [
      ['Add a home page', true],
      ['Make it blue', false],
    ])
    const other = (await builder.conversations('shop'))[1]!.session
    await builder.forget('shop', other)
    assert.equal((await builder.conversations('shop')).length, 1)
    await assert.rejects(builder.resume('shop', '../../etc'), /Unknown conversation/)
  })

  test('after the request is filed, each changeset runs in a fresh session until nothing is left', async () => {
    const home = await mkdtemp(join(tmpdir(), 'pikku-builder-'))
    const sessions: string[] = []
    let open = 1
    const queue = async (_cwd: string, args: string[]) => {
      if (args[2] === '--prompt') return { code: 0, output: intake(args[3]!) }
      if (!open) return { code: 0, output: JSON.stringify({ agent: null, skill: null, refs: [], reason: 'Nothing to do', context: null, merged: ['Contact page → main @ abc1234'] }) }
      open -= 1
      return { code: 0, output: JSON.stringify({ agent: 'changes', skill: 'pikku-changes', refs: [], reason: '1 open change(s)', context: '# Open changes', merged: [] }) }
    }
    const builder = new BuilderSession(
      async () => ({
        cwd: home,
        run: queue,
        launch: (_command, args) => {
          sessions.push(args[args.indexOf('--session-id') + 1]!)
          return spawn(process.execPath, ['-e', fakePi], { stdio: ['pipe', 'pipe', 'pipe'] })
        },
      }),
      home
    )
    await builder.prompt('shop', 'Add a contact page')
    await until(async () => sessions.length === 2 && !(await builder.state('shop')).busy)
    await until(async () => (await builder.state('shop')).items.some((i) => i.kind === 'loop' && i.text.startsWith('Merged')))
    const { session, items } = await builder.state('shop')
    assert.deepEqual(sessions, [session, `${session}-1`])
    assert.deepEqual(
      items.filter((i) => i.kind === 'loop').map((i) => (i as { text: string }).text),
      ['1 open change(s)', 'Merged Contact page → main @ abc1234']
    )
  })
})
