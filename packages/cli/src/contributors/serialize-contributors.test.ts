import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeContributors } from './serialize-contributors.js'
import type { ResolvedContributor } from './resolve-contributors.js'

const platform = {
  serviceNames: ['a'],
  needsQueue: false,
  needsWorkflow: false,
  needsAgent: false,
  db: { engine: 'postgres' as const, coercionMap: { t: { c: 'int' } } },
}
const contributor = (
  name: string,
  hooks = { start: false, stop: false },
  exportName = `${name}Dev`
): ResolvedContributor => ({
  name,
  module: `/pkg/src/${name}.ts`,
  export: exportName,
  hooks,
})
const serialize = (contributors: ResolvedContributor[]) =>
  serializeContributors({
    contributors,
    platform,
    specifier: ({ module }) => `pkg${module.slice('/pkg'.length)}`,
  })

describe('serializeContributors', () => {
  test('imports only the contributors it is given', () => {
    const source = serialize([contributor('one'), contributor('two')])
    assert.match(
      source,
      /import \{ oneDev as contributor0 \} from "pkg\/src\/one.ts"/
    )
    assert.match(
      source,
      /import \{ twoDev as contributor1 \} from "pkg\/src\/two.ts"/
    )
    assert.equal((source.match(/^import /gm) ?? []).length, 2)
    assert.ok(!source.includes('three'))
  })

  test('runs them in the order given, each with the platform', () => {
    const source = serialize([contributor('b'), contributor('a')])
    const calls = [
      ...source.matchAll(
        /await (contributor\d)\.run\(services, env, runtime, platform\)/g
      ),
    ]
    assert.deepEqual(
      calls.map((m) => m[1]),
      ['contributor0', 'contributor1']
    )
    assert.ok(source.indexOf('// b') < source.indexOf('// a'))
  })

  test('inlines the platform once, as a literal', () => {
    const source = serialize([contributor('one'), contributor('two')])
    assert.equal(source.split('const platform: any = ').length, 2)
    const literal = source.match(/const platform: any = (.*)/)![1]!
    assert.deepEqual(JSON.parse(literal), platform)
  })

  test('exports createPlatformServices that hands every run the same bag', () => {
    const source = serialize([contributor('one')])
    assert.match(source, /export const createPlatformServices = async \(env/)
    assert.equal((source.match(/const services: /g) ?? []).length, 1)
    assert.match(source, /return services/)
  })

  test('a default export imports as a default', () => {
    const source = serialize([contributor('one', undefined, 'default')])
    assert.match(source, /import contributor0 from "pkg\/src\/one.ts"/)
  })

  test('lists start hooks in run order and stop hooks reversed', () => {
    const hooks = { start: true, stop: true }
    const source = serialize([
      contributor('first', hooks),
      contributor('plain'),
      contributor('last', hooks),
    ])
    const names = (kind: string) => {
      const block = source
        .split(`export const ${kind}: ServerHook[] = [`)[1]!
        .split(']')[0]!
      return [...block.matchAll(/name: "(\w+)"/g)].map((m) => m[1])
    }
    assert.deepEqual(names('serverStartHooks'), ['first', 'last'])
    assert.deepEqual(names('serverStopHooks'), ['last', 'first'])
  })

  test('no contributors still yields a valid, empty file', () => {
    const source = serialize([])
    assert.ok(!source.includes('import '))
    assert.match(source, /export const createPlatformServices/)
    assert.match(
      source,
      /export const serverStartHooks: ServerHook\[\] = \[\n\]/
    )
  })
})
