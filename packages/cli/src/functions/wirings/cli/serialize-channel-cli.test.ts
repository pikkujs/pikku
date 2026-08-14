import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeChannelCLI } from './serialize-channel-cli.js'
import type { CLIProgramMeta } from '@pikku/core/ecosystem/cli'

const programMeta = (auth?: boolean): CLIProgramMeta =>
  ({
    name: 'fabric',
    description: 'fabric',
    commands: {},
    options: {},
    ...(auth === undefined ? {} : { auth }),
  }) as unknown as CLIProgramMeta

const serialize = (auth?: boolean): string =>
  serializeChannelCLI(
    'fabric',
    programMeta(auth),
    '#channel',
    new Map(),
    {},
    '#channelTypes',
    '#functionTypes'
  )

describe('serializeChannelCLI auth default', () => {
  test('defaults the generated channel to session-required when auth is unset', () => {
    const out = serialize(undefined)
    assert.match(
      out,
      /auth: true/,
      'an unset program auth must emit a session-required channel'
    )
    assert.match(out, /onConnect: cliRequireSession/)
  })

  test('emits session-required when auth is explicitly true', () => {
    assert.match(serialize(true), /auth: true/)
  })

  test('emits a public channel only when auth is explicitly false', () => {
    const out = serialize(false)
    assert.match(out, /auth: false/)
    assert.ok(
      !out.includes('onConnect: cliRequireSession'),
      'an explicitly public channel must not require a session'
    )
  })
})
