import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { verifyScopes } from '@pikku/core'
import { pikkuState } from '@pikku/core/ecosystem'
import { ConflictError, MissingScopeError } from '@pikku/core/errors'

import { installAddon } from './install-addon.function.js'
import { installOpenapiAddon } from './install-openapi-addon.function.js'

const installers = [
  ['installAddon', installAddon],
  ['installOpenapiAddon', installOpenapiAddon],
] as const

for (const [name, installer] of installers) {
  test(`${name} refuses a caller with no session`, () => {
    assert.throws(
      () => verifyScopes(installer.scopes, undefined),
      MissingScopeError
    )
  })

  test(`${name} refuses a signed-in non-admin`, () => {
    assert.throws(
      () =>
        verifyScopes(installer.scopes, {
          userId: 'alice',
          scopes: ['pikku:console:scopes:read'],
        }),
      MissingScopeError
    )
  })

  test(`${name} admits a holder of the install scope`, () => {
    assert.doesNotThrow(() =>
      verifyScopes(installer.scopes, {
        userId: 'root',
        scopes: ['pikku:console:addons:install'],
      })
    )
  })

  test(`${name} admits a holder of the console root`, () => {
    assert.doesNotThrow(() =>
      verifyScopes(installer.scopes, {
        userId: 'root',
        scopes: ['pikku:console'],
      })
    )
  })

  test(`${name} no longer admits a bare admin`, () => {
    assert.throws(
      () =>
        verifyScopes(installer.scopes, { userId: 'root', scopes: ['admin'] }),
      MissingScopeError
    )
  })

  test(`${name} does not declare itself unauthenticated`, () => {
    assert.notEqual(installer.auth, false)
  })
}

/**
 * A throwaway project on disk, because the function reads one: it resolves the
 * root from the MetaService basePath and then looks for a wiring file. Nothing
 * here reaches the package manager — every case below is refused before the
 * install would run, which is the whole point of the check.
 */
const project = () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'pikku-install-addon-'))
  const pikkuDir = join(rootDir, 'src', '.pikku')
  mkdirSync(pikkuDir, { recursive: true })
  writeFileSync(
    join(rootDir, 'pikku.config.json'),
    JSON.stringify({ scaffold: { pikkuDir: 'src/.pikku' } })
  )
  return {
    rootDir,
    services: { metaService: { basePath: pikkuDir } } as never,
  }
}

const install = (services: never, namespace: string) =>
  installAddon.func(
    services,
    { packageName: '@pikku/addon-email-send', namespace } as never,
    { session: { scopes: ['admin'] } } as never
  )

test('a name the registry already wires is a conflict, not a 500', async () => {
  const { services } = project()
  // Wired from anywhere — `wirings/` in the e2e fixture — so there is no file
  // in the addons directory to find it by. The registry is the only thing that
  // knows, and before it was asked this fell through to the package manager and
  // surfaced as an unhandled 500.
  pikkuState(null, 'addons', 'packages').set('emails', {} as never)

  await assert.rejects(
    () => install(services, 'emails'),
    (error: unknown) => {
      assert.ok(
        error instanceof ConflictError,
        `expected a ConflictError, got ${error}`
      )
      assert.match(error.message, /already installed under the name "emails"/)
      return true
    }
  )

  pikkuState(null, 'addons', 'packages').delete('emails')
})

test('a wiring written but not yet loaded is a conflict too', async () => {
  const { rootDir, services } = project()
  // The registry has not seen this one — the file exists and nothing has
  // imported it — so the file check is what catches it.
  const addonDir = join(rootDir, 'src', 'addons')
  mkdirSync(addonDir, { recursive: true })
  writeFileSync(join(addonDir, 'reports.addon.ts'), '')

  await assert.rejects(
    () => install(services, 'reports'),
    (error: unknown) => error instanceof ConflictError
  )
})

test('a namespace that is not a namespace is refused before anything else', async () => {
  const { services } = project()
  await assert.rejects(
    () => install(services, 'Not A Namespace!'),
    /Invalid namespace/
  )
})
