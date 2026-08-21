import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { maskMessage, maskCatalog } from './generate-mask-locale.js'
import { paraglideMaskLocale } from './vite.js'

test('every visible character becomes a block', () => {
  assert.equal(maskMessage('Save changes'), '████ ███████')
})

test('placeholders survive intact', () => {
  assert.equal(
    maskMessage('Delete {name} for everyone'),
    '██████ {name} ███ ████████'
  )
})

test('whitespace and line breaks are preserved', () => {
  assert.equal(maskMessage('one\ttwo\nthree'), '███\t███\n█████')
})

test('a message that is only a placeholder is untouched', () => {
  assert.equal(maskMessage('{count}'), '{count}')
})

test('$schema is carried through unmasked', () => {
  const masked = maskCatalog({
    $schema: 'https://inlang.com/schema/inlang-message-format',
    greeting: 'Hello',
  })
  assert.equal(
    masked.$schema,
    'https://inlang.com/schema/inlang-message-format'
  )
  assert.equal(masked.greeting, '█████')
})

test('non-string values pass through unchanged', () => {
  const variants = { match: { 'count=one': 'one item' } }
  const masked = maskCatalog({ items: variants })
  assert.deepEqual(masked.items, variants)
})

test('key order is preserved so the diff stays readable', () => {
  const masked = maskCatalog({ b: 'x', a: 'y', $schema: 'z' })
  assert.deepEqual(Object.keys(masked), ['b', 'a', '$schema'])
})

const withCatalog = (): { dir: string; catalog: string; out: string } => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-mask-'))
  const catalog = join(dir, 'en.json')
  writeFileSync(catalog, JSON.stringify({ greeting: 'Hello there' }))
  return { dir, catalog, out: join(dir, 'zz.json') }
}

test('the plugin writes the mask catalogue when serving', () => {
  const { catalog, out } = withCatalog()
  const plugin = paraglideMaskLocale({ catalog, outFile: out })
  ;(plugin.config as any)({}, { command: 'serve' })

  assert.equal(JSON.parse(readFileSync(out, 'utf8')).greeting, '█████ █████')
})

test('the plugin deletes the mask catalogue on a build', () => {
  const { catalog, out } = withCatalog()
  writeFileSync(out, '{}')

  const plugin = paraglideMaskLocale({ catalog, outFile: out })
  ;(plugin.config as any)({}, { command: 'build' })

  assert.equal(existsSync(out), false)
})

test('the mask catalogue defaults to the locale name beside the catalog', () => {
  const { dir, catalog } = withCatalog()
  const plugin = paraglideMaskLocale({ catalog, locale: 'qq' })
  ;(plugin.config as any)({}, { command: 'serve' })

  assert.equal(existsSync(join(dir, 'qq.json')), true)
})

test('the plugin runs before paraglide compiles', () => {
  assert.equal(paraglideMaskLocale().enforce, 'pre')
})
