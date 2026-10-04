import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EMAIL_CATALOG, addCatalogEmail, findCatalogEmail } from './index.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pikku-emails-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const themeKeys = [
  'canvas',
  'surface',
  'border',
  'text',
  'muted',
  'accent',
  'button',
  'buttonText',
]

describe('email catalogue', () => {
  test('every template only reads theme colours the template theme defines', () => {
    for (const entry of EMAIL_CATALOG) {
      for (const content of Object.values(entry.source)) {
        for (const [, key] of content.matchAll(/theme\.colors\.(\w+)/g)) {
          assert.ok(
            themeKeys.includes(key!),
            `${entry.name} reads theme.colors.${key}`
          )
        }
      }
    }
  })

  test('every t.* placeholder is supplied by the locale block', () => {
    for (const entry of EMAIL_CATALOG) {
      for (const content of Object.values(entry.source)) {
        for (const [, key, field] of content.matchAll(/\bt\.(\w+)\.(\w+)/g)) {
          assert.ok(
            entry.locale[key!]?.[field!] !== undefined,
            `${entry.name} t.${key}.${field}`
          )
        }
      }
    }
  })

  test('finds by name or locale key', () => {
    assert.equal(findCatalogEmail('magicLink')?.name, 'magic-link')
    assert.equal(findCatalogEmail('Password-Reset')?.name, 'password-reset')
    assert.equal(findCatalogEmail('nope'), undefined)
  })

  test('writes nothing when the locale file is malformed', () => {
    mkdirSync(join(dir, 'locales'), { recursive: true })
    writeFileSync(join(dir, 'locales', 'en.json'), '{ not json')
    assert.throws(() => addCatalogEmail(dir, 'welcome'))
    assert.equal(existsSync(join(dir, 'templates', 'welcome.html')), false)
  })

  test('adds the files and merges the locale block without clobbering', () => {
    mkdirSync(join(dir, 'locales'), { recursive: true })
    writeFileSync(
      join(dir, 'locales', 'en.json'),
      JSON.stringify({ common: { footer: 'x' }, welcome: { subject: 'Mine' } })
    )
    const result = addCatalogEmail(dir, 'welcome')
    assert.equal(result.written.length, 3)
    assert.ok(existsSync(join(dir, 'templates', 'welcome.html')))
    const locale = JSON.parse(
      readFileSync(join(dir, 'locales', 'en.json'), 'utf8')
    )
    assert.equal(locale.common.footer, 'x')
    assert.equal(locale.welcome.subject, 'Mine')
    assert.ok(locale.welcome.heading)
    assert.ok(!result.localeKeysAdded.includes('welcome.subject'))
  })

  test('keeps edited template files unless forced', () => {
    addCatalogEmail(dir, 'receipt')
    writeFileSync(join(dir, 'templates', 'receipt.html'), 'edited')
    const again = addCatalogEmail(dir, 'receipt')
    assert.equal(again.written.length, 0)
    assert.equal(
      readFileSync(join(dir, 'templates', 'receipt.html'), 'utf8'),
      'edited'
    )
    addCatalogEmail(dir, 'receipt', { force: true })
    assert.notEqual(
      readFileSync(join(dir, 'templates', 'receipt.html'), 'utf8'),
      'edited'
    )
  })

  test('rejects an unknown name', () => {
    assert.throws(() => addCatalogEmail(dir, 'nope'), /No catalogue email/)
  })
})
