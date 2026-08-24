import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  projectWiresChannels,
  runWebsocketDepsChecks,
} from './websocket-deps-checks.js'

const installed = (...names: string[]) => {
  const set = new Set(names)
  return (specifier: string) =>
    set.has(specifier) ? `/node_modules/${specifier}` : undefined
}

describe('websocket deps checks', () => {
  test('says nothing when both packages resolve', () => {
    const findings = runWebsocketDepsChecks({
      root: '/project',
      runtime: 'node',
      hasChannels: true,
      resolve: installed('@pikku/ws', 'ws'),
    })
    assert.deepEqual(findings, [])
  })

  test('says nothing under Bun, which serves WebSockets natively', () => {
    const findings = runWebsocketDepsChecks({
      root: '/project',
      runtime: 'bun',
      hasChannels: true,
      resolve: installed(),
    })
    assert.deepEqual(findings, [])
  })

  test('says nothing when the project wires no channels', () => {
    const findings = runWebsocketDepsChecks({
      root: '/project',
      runtime: 'node',
      hasChannels: false,
      resolve: installed(),
    })
    assert.deepEqual(findings, [])
  })

  test('errors when a channel-wiring Node project is missing them', () => {
    const findings = runWebsocketDepsChecks({
      root: '/project',
      runtime: 'node',
      hasChannels: true,
      resolve: installed(),
    })
    assert.equal(findings.length, 1)
    assert.equal(findings[0]!.id, 'websocket-deps-missing')
    assert.equal(findings[0]!.severity, 'error')
    assert.match(findings[0]!.message, /@pikku\/ws and ws/)
  })

  test('names only the package that is missing', () => {
    const findings = runWebsocketDepsChecks({
      root: '/project',
      runtime: 'node',
      hasChannels: true,
      resolve: installed('@pikku/ws'),
    })
    assert.equal(findings.length, 1)
    assert.match(findings[0]!.message, /^ws is not installed/)
  })

  test('points at the project package.json', () => {
    const findings = runWebsocketDepsChecks({
      root: '/project',
      runtime: 'node',
      hasChannels: true,
      resolve: installed(),
    })
    assert.equal(findings[0]!.path, join('/project', 'package.json'))
  })
})

describe('projectWiresChannels', () => {
  const project = async (meta?: string) => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-ws-deps-'))
    if (meta !== undefined) {
      await mkdir(join(root, '.pikku', 'channel'), { recursive: true })
      await writeFile(
        join(root, '.pikku', 'channel', 'pikku-channels-meta.gen.json'),
        meta
      )
    }
    return root
  }

  test('is false when codegen has not run', async () => {
    assert.equal(await projectWiresChannels(await project(), '.pikku'), false)
  })

  test('is false when no channel is wired', async () => {
    assert.equal(
      await projectWiresChannels(await project('{}'), '.pikku'),
      false
    )
  })

  test('is true when a channel is wired', async () => {
    const root = await project('{"todos-live":{"name":"todos-live"}}')
    assert.equal(await projectWiresChannels(root, '.pikku'), true)
  })
})
