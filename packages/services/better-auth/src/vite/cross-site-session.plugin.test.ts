import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  crossSiteSession,
  ROOT_ROUTE,
  virtualModuleSource,
} from './cross-site-session.plugin.js'

type Transform = (
  code: string,
  id: string,
  options?: { ssr?: boolean }
) => { code: string } | undefined

const transformOf = (plugin: ReturnType<typeof crossSiteSession>): Transform =>
  plugin.transform as unknown as Transform

describe('crossSiteSession plugin', () => {
  const plugin = crossSiteSession({ envFile: '/app/src/pikku/env.gen.ts' })

  test('only runs on the dev server, so a build never contains it', () => {
    assert.equal(plugin.apply, 'serve')
  })

  test('prepends the install to the root route, under every split id', () => {
    for (const id of [
      '/app/src/routes/__root.tsx',
      '/app/src/routes/__root.tsx?tsr-split=component',
    ]) {
      const out = transformOf(plugin)('export const x = 1', id)
      assert.ok(
        out?.code.startsWith('import "virtual:pikku-cross-site-session"')
      )
    }
  })

  test('leaves other modules and the server render alone', () => {
    assert.equal(
      transformOf(plugin)('x', '/app/src/routes/index.tsx'),
      undefined
    )
    assert.equal(
      transformOf(plugin)('x', '/app/src/routes/__root.tsx', { ssr: true }),
      undefined
    )
  })

  test('the root route pattern does not match a route that merely contains the name', () => {
    assert.equal(ROOT_ROUTE.test('/app/src/routes/__root.tsx.bak'), false)
  })

  test("the virtual module passes the app's own apiUrl to the relay", () => {
    const source = virtualModuleSource('/app/src/pikku/env.gen.ts')
    assert.match(
      source,
      /import \{ apiUrl \} from "\/app\/src\/pikku\/env\.gen\.ts"/
    )
    assert.match(source, /installCrossSiteSession\(apiUrl\)/)
  })

  test('without an env file the relay falls back to VITE_API_URL, then the page origin', () => {
    const source = virtualModuleSource()
    assert.match(source, /VITE_API_URL \?\? window\.location\.origin/)
  })

  test('resolves and loads its virtual module', () => {
    const resolve = plugin.resolveId as unknown as (
      id: string
    ) => string | undefined
    const load = plugin.load as unknown as (id: string) => string | undefined
    const resolved = resolve('virtual:pikku-cross-site-session')
    assert.ok(resolved)
    assert.match(load(resolved!) ?? '', /installCrossSiteSession/)
    assert.equal(resolve('something-else'), undefined)
  })
})
