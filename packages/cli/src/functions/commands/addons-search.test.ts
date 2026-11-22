import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildHits,
  orderHits,
  scanProjectAddons,
  searchVerdict,
} from './addons-search.js'

const none = { installed: new Set<string>(), wired: new Set<string>() }
const entry = (n: string, extra: object = {}) => ({
  name: `@pikku/addon-${n}`,
  displayName: n,
  description: `${n} addon`,
  ...extra,
})

describe('searchVerdict', () => {
  test('nothing is none', () => assert.equal(searchVerdict('x', []), 'none'))
  test('one hit is exact', () =>
    assert.equal(
      searchVerdict('slack', buildHits([entry('slack')], none)),
      'exact'
    ))
  test('a vendor name matching the top hit is exact', () =>
    assert.equal(
      searchVerdict(
        'stripe',
        buildHits([entry('stripe'), entry('commerce-stripe')], none)
      ),
      'exact'
    ))
  test('a category phrase with several candidates is several', () =>
    assert.equal(
      searchVerdict(
        'send a text message',
        buildHits([entry('twilio'), entry('vonage'), entry('msg91')], none)
      ),
      'several'
    ))
  test('a clear score gap is exact', () =>
    assert.equal(
      searchVerdict(
        'sms',
        buildHits(
          [entry('twilio', { score: 0.9 }), entry('vonage', { score: 0.3 })],
          none
        )
      ),
      'exact'
    ))
  test('a wired addon wins over everything', () => {
    const project = {
      installed: new Set<string>(),
      wired: new Set(['@pikku/addon-vonage']),
    }
    assert.equal(
      searchVerdict(
        'send a text message',
        buildHits([entry('twilio'), entry('vonage')], project)
      ),
      'wired'
    )
  })
  test('an installed one is reported as installed', () => {
    const project = {
      installed: new Set(['@pikku/addon-twilio']),
      wired: new Set<string>(),
    }
    assert.equal(
      searchVerdict(
        'sms',
        buildHits([entry('vonage'), entry('twilio')], project)
      ),
      'installed'
    )
  })
})

describe('orderHits', () => {
  test('wired, then installed, then first-party, then the rest', () => {
    const project = {
      installed: new Set(['@pikku/addon-b']),
      wired: new Set(['@pikku/addon-c']),
    }
    const hits = buildHits(
      [entry('a'), entry('b'), entry('c'), { name: 'thirdparty-x' }],
      project
    )
    assert.deepEqual(
      orderHits(hits).map((h) => h.shortName),
      ['c', 'b', 'a', 'thirdparty-x']
    )
  })
})

describe('scanProjectAddons', () => {
  test('reads dependencies and wireAddon package names', () => {
    const root = mkdtempSync(join(tmpdir(), 'pikku-search-'))
    mkdirSync(join(root, 'packages/functions/src'), { recursive: true })
    writeFileSync(
      join(root, 'packages/functions/package.json'),
      JSON.stringify({ dependencies: { '@pikku/addon-slack': '1.0.0' } })
    )
    writeFileSync(
      join(root, 'packages/functions/src/addons.ts'),
      `wireAddon({ name: 'slack', package: '@pikku/addon-slack' })\nwireAddon({ name: 'x', package: '@pikku/addon-stripe' })`
    )
    const found = scanProjectAddons(root)
    assert.ok(found.installed.has('@pikku/addon-slack'))
    assert.ok(found.wired.has('@pikku/addon-slack'))
    assert.ok(found.wired.has('@pikku/addon-stripe'))
  })
})
