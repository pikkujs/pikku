import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { generateWranglerToml } from './wrangler-toml.js'

const manifest = { secrets: [], queues: [], scheduledTasks: [] } as never

const channelUnit = (dependsOn: string[]) =>
  ({
    name: 'channel-cli',
    role: 'channel',
    target: 'serverless',
    services: [],
    handlers: [{ type: 'fetch', routes: [] }],
    dependsOn,
  }) as never

const serviceBlocks = (toml: string) =>
  toml
    .split('\n')
    .filter((line) => line.startsWith('binding = '))
    .map((line) => line.slice('binding = '.length).replaceAll('"', ''))

describe('wrangler.toml service bindings', () => {
  // A gateway collects one dependency per function it serves, so two functions
  // in the same unit named that unit twice — and wrangler rejects the whole
  // config with "assigned to multiple Worker bindings", so `wrangler dev` and
  // an ejected unit both failed before they started.
  test('binds a repeated dependency once', () => {
    const toml = generateWranglerToml(
      channelUnit(['svc-base', 'svc-base', 'svc-kysely', 'svc-kysely']),
      manifest,
      'root'
    )
    assert.deepEqual(serviceBlocks(toml), ['SVC_BASE', 'SVC_KYSELY'])
  })

  test('keeps distinct dependencies', () => {
    const toml = generateWranglerToml(
      channelUnit(['svc-base', 'svc-kysely']),
      manifest,
      'root'
    )
    assert.deepEqual(serviceBlocks(toml), ['SVC_BASE', 'SVC_KYSELY'])
    assert.match(toml, /service = "root-svc-base"/)
    assert.match(toml, /service = "root-svc-kysely"/)
  })

  // toScreamingSnake flattens `-`, `_` and camel humps onto the same name, so
  // two genuinely different units can ask for one binding. Emitting it once
  // would bind the loser's callers to the winner's worker, which deploys
  // cleanly and then answers from the wrong service.
  test('refuses two dependencies that emit the same binding', () => {
    assert.throws(
      () =>
        generateWranglerToml(
          channelUnit(['svc-base', 'svc_base']),
          manifest,
          'root'
        ),
      /both bind as "SVC_BASE"/
    )
  })

  test('refuses a camel-cased dependency colliding with a kebab one', () => {
    assert.throws(
      () =>
        generateWranglerToml(
          channelUnit(['svc-base', 'svcBase']),
          manifest,
          'root'
        ),
      /both bind as "SVC_BASE"/
    )
  })

  test('emits no service section without dependencies', () => {
    const toml = generateWranglerToml(channelUnit([]), manifest, 'root')
    assert.equal(toml.includes('[[services]]'), false)
  })

  test('still declares the hibernation class for a channel unit', () => {
    const toml = generateWranglerToml(
      channelUnit(['svc-base', 'svc-base']),
      manifest,
      'root'
    )
    assert.match(toml, /class_name = "WebSocketHibernationServer"/)
  })
})
