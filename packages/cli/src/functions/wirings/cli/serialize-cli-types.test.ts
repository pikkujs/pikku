import { test, describe } from 'node:test'
import * as assert from 'assert'
import { serializeCLITypes } from './serialize-cli-types.js'

const serialize = (addon: boolean) =>
  serializeCLITypes(
    './pikku-types.gen.js',
    './middleware.gen.js',
    `import type { Session } from './session.js'`,
    'Session',
    `import type { SingletonServices } from './services.js'`,
    'SingletonServices',
    { addon }
  )

describe('serializeCLITypes', () => {
  /**
   * An addon declares commands; the consuming app mounts them with `refCLI`.
   * `wireCLI` reaches a registry the addon does not own, so it is the one
   * export the addon half of this leaf drops — along with `CLIWiring` and the
   * `CoreCLI` import that only `CLIWiring` needs, since tsc compiles every
   * file in the output tree whether the barrel re-exports it or not.
   */
  test('an addon gets the command helpers but not wireCLI', () => {
    const out = serialize(true)
    assert.match(out, /export const defineCLICommands/)
    assert.match(out, /export const pikkuCLICommand/)
    assert.match(out, /export const pikkuCLIRender/)
    assert.doesNotMatch(out, /export const wireCLI/)
    assert.doesNotMatch(out, /wireCLICore/)
    assert.doesNotMatch(out, /CoreCLI,/)
    assert.doesNotMatch(out, /type CLIWiring/)
  })

  test('an application gets the whole leaf', () => {
    const out = serialize(false)
    assert.match(out, /export const wireCLI/)
    assert.match(out, /export const defineCLICommands/)
    assert.match(out, /CoreCLI,/)
  })
})
