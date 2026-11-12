import { describe, test } from 'node:test'
import assert from 'node:assert'
import type { CLIMeta, CLIProgramMeta } from '@pikku/core/cli'
import {
  normalizeCLIEntrypoints,
  withCLIEntrypoints,
} from './cli-entrypoints.js'

const program = (name: string): CLIProgramMeta => ({
  program: name,
  commands: {},
  options: {},
})

const cliMeta = (...names: string[]): CLIMeta => ({
  programs: Object.fromEntries(names.map((name) => [name, program(name)])),
  renderers: {},
})

describe('normalizeCLIEntrypoints', () => {
  test('a plain path is a local entrypoint', () => {
    assert.deepStrictEqual(normalizeCLIEntrypoints('admin', 'bin/admin.ts'), [
      { type: 'local', path: 'bin/admin.ts' },
    ])
  })

  test('a local object keeps its path', () => {
    assert.deepStrictEqual(
      normalizeCLIEntrypoints('admin', { type: 'local', path: 'bin/a.ts' }),
      [{ type: 'local', path: 'bin/a.ts' }]
    )
  })

  test('a channel defaults its name and prefixed route', () => {
    assert.deepStrictEqual(
      normalizeCLIEntrypoints(
        'admin',
        { type: 'channel', wirePath: 'src/cli.gen.ts' },
        '/api'
      ),
      [
        {
          type: 'channel',
          name: 'admin-cli',
          route: '/api/cli/admin',
          wirePath: 'src/cli.gen.ts',
          path: undefined,
        },
      ]
    )
  })

  test('a channel keeps a configured name and route', () => {
    assert.deepStrictEqual(
      normalizeCLIEntrypoints(
        'admin',
        {
          type: 'channel',
          name: 'ops',
          route: '/ops/ws',
          wirePath: 'src/cli.gen.ts',
          path: 'bin/client.ts',
        },
        '/api'
      ),
      [
        {
          type: 'channel',
          name: 'ops',
          route: '/ops/ws',
          wirePath: 'src/cli.gen.ts',
          path: 'bin/client.ts',
        },
      ]
    )
  })

  test('a list keeps its order', () => {
    const entrypoints = normalizeCLIEntrypoints('admin', [
      'bin/admin.ts',
      { type: 'channel', wirePath: 'src/cli.gen.ts' },
    ])
    assert.deepStrictEqual(
      entrypoints.map((e) => e.type),
      ['local', 'channel']
    )
  })

  test('refuses a local object without a path', () => {
    assert.throws(
      () =>
        normalizeCLIEntrypoints('admin', {
          type: 'local',
          path: '',
        }),
      /CLI entrypoint must have a path/
    )
  })
})

describe('withCLIEntrypoints', () => {
  test('leaves the metadata alone without cli.entrypoints', () => {
    const meta = cliMeta('admin')
    assert.strictEqual(withCLIEntrypoints(meta, {}), meta)
  })

  test('a local-only program lists a local entrypoint', () => {
    const result = withCLIEntrypoints(cliMeta('admin'), {
      cli: { entrypoints: { admin: 'bin/admin.ts' } },
    })
    assert.deepStrictEqual(result.programs.admin!.entrypoints, [
      { type: 'local' },
    ])
  })

  test('a channel-only program lists the default channel and route', () => {
    const result = withCLIEntrypoints(cliMeta('admin'), {
      globalHTTPPrefix: '/api',
      cli: {
        entrypoints: {
          admin: { type: 'channel', wirePath: 'src/cli.gen.ts' },
        },
      },
    })
    assert.deepStrictEqual(result.programs.admin!.entrypoints, [
      { type: 'channel', channel: 'admin-cli', route: '/api/cli/admin' },
    ])
  })

  test('a channel lists its configured name and route', () => {
    const result = withCLIEntrypoints(cliMeta('admin'), {
      cli: {
        entrypoints: {
          admin: {
            type: 'channel',
            name: 'ops',
            route: '/ops/ws',
            wirePath: 'src/cli.gen.ts',
          },
        },
      },
    })
    assert.deepStrictEqual(result.programs.admin!.entrypoints, [
      { type: 'channel', channel: 'ops', route: '/ops/ws' },
    ])
  })

  test('a program configured both ways lists both', () => {
    const result = withCLIEntrypoints(cliMeta('admin'), {
      cli: {
        entrypoints: {
          admin: [
            'bin/admin.ts',
            { type: 'channel', wirePath: 'src/cli.gen.ts' },
          ],
        },
      },
    })
    assert.deepStrictEqual(result.programs.admin!.entrypoints, [
      { type: 'local' },
      { type: 'channel', channel: 'admin-cli', route: '/cli/admin' },
    ])
  })

  test('a program with no entrypoint has none, and an unknown one is skipped', () => {
    const meta = cliMeta('admin', 'tools')
    const result = withCLIEntrypoints(meta, {
      cli: { entrypoints: { admin: 'bin/admin.ts', ghost: 'bin/ghost.ts' } },
    })
    assert.strictEqual(result.programs.tools!.entrypoints, undefined)
    assert.strictEqual(result.programs.ghost, undefined)
    assert.strictEqual(meta.programs.admin!.entrypoints, undefined)
  })
})
