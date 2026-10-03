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
})
