import assert from 'node:assert'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import {
  I18nService,
  INLANG_SCHEMA,
  MISSING_MARKER,
  messagePlaceholders,
  pluralCategories,
} from './i18n.service.js'

const MSGS = 'apps/app/messages'
const COUNT = [
  {
    declarations: ['input count', 'local countPlural = count: plural'],
    selectors: ['countPlural'],
    match: {
      'countPlural=one': '{count} file',
      'countPlural=other': '{count} files',
    },
  },
]
const plural = (match: Record<string, string>, input = 'count') => [
  {
    declarations: [`input ${input}`, `local ${input}Plural = ${input}: plural`],
    selectors: [`${input}Plural`],
    match: Object.fromEntries(
      Object.entries(match).map(([c, t]) => [`${input}Plural=${c}`, t])
    ),
  },
]

const fixture = async (
  files: Record<string, unknown>,
  locales = ['en', 'de']
): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-i18n-plural-'))
  const app = join(root, 'apps/app')
  await mkdir(join(app, 'project.inlang'), { recursive: true })
  await mkdir(join(app, 'messages'), { recursive: true })
  await writeFile(
    join(app, 'project.inlang/settings.json'),
    JSON.stringify({
      baseLocale: 'en',
      locales,
      'plugin.inlang.messageFormat': {
        pathPattern: './messages/{locale}.json',
      },
    })
  )
  for (const [locale, content] of Object.entries(files))
    await writeFile(
      join(app, `messages/${locale}.json`),
      typeof content === 'string' ? content : JSON.stringify(content, null, 2)
    )
  return root
}
const read = (root: string, locale: string) =>
  readFile(join(root, MSGS, `${locale}.json`), 'utf-8')
const json = async (root: string, locale: string) =>
  JSON.parse(await read(root, locale))

describe('$schema', () => {
  test('writeLocale adds it first when absent', async () => {
    const root = await fixture({ en: { hello: 'Hello' } }, ['en'])
    await new I18nService(root).writeLocale('apps/app', 'en', {
      hello: 'Hello',
    })
    assert.deepStrictEqual(Object.keys(await json(root, 'en')), [
      '$schema',
      'hello',
    ])
    assert.strictEqual((await json(root, 'en')).$schema, INLANG_SCHEMA)
  })
  test('round trip keeps an existing one, also another URL, and key order', async () => {
    const root = await fixture(
      { en: { $schema: 'https://example.com/other', zeta: 'Z', alpha: 'A' } },
      ['en']
    )
    const i18n = new I18nService(root)
    const [app] = await i18n.listApps()
    await i18n.writeLocale('apps/app', 'en', app!.locales.en!)
    const out = await json(root, 'en')
    assert.deepStrictEqual(Object.keys(out), ['$schema', 'zeta', 'alpha'])
    assert.strictEqual(out.$schema, 'https://example.com/other')
  })
  test('content that carries its own $schema wins; the standard URL is the fallback', async () => {
    const root = await fixture({ en: { hello: 'Hello' } }, ['en'])
    const i18n = new I18nService(root)
    await i18n.writeLocale('apps/app', 'en', {
      $schema: 'https://example.com/x',
      hello: 'Hello',
    } as never)
    // flat() drops $-keys from content, so the file's current value stays; here none existed
    assert.strictEqual((await json(root, 'en')).$schema, INLANG_SCHEMA)
  })
  test('sync, addLocale and setKey keep or add it', async () => {
    const root = await fixture({ en: { a: 'A' }, de: { a: 'A' } })
    const i18n = new I18nService(root)
    await i18n.setKey('apps/app', 'b', { en: 'B' })
    assert.strictEqual(Object.keys(await json(root, 'en'))[0], '$schema')
    await writeFile(join(root, MSGS, 'de.json'), JSON.stringify({ a: 'A' }))
    await i18n.sync('apps/app')
    assert.strictEqual(Object.keys(await json(root, 'de'))[0], '$schema')
    await i18n.addLocale('apps/app', 'fr')
    assert.strictEqual(Object.keys(await json(root, 'fr'))[0], '$schema')
  })
})

describe('plural messages', () => {
  test('categories come from Intl.PluralRules', () => {
    assert.deepStrictEqual(pluralCategories('de'), ['one', 'other'])
    assert.deepStrictEqual([...pluralCategories('ar')].sort(), [
      'few',
      'many',
      'one',
      'other',
      'two',
      'zero',
    ])
  })

  test('placeholders read inputs and texts', () => {
    assert.deepStrictEqual(messagePlaceholders(COUNT), ['count'])
    assert.deepStrictEqual(
      messagePlaceholders(
        plural({ one: 'ein Datei', other: '{name}: viele' }) as never
      ),
      ['count', 'name']
    )
  })

  test('round trip: read, write, and the shape is unchanged', async () => {
    const root = await fixture(
      { en: { $schema: INLANG_SCHEMA, count_files: COUNT, hi: 'Hi' } },
      ['en']
    )
    const i18n = new I18nService(root)
    const [app] = await i18n.listApps()
    assert.deepStrictEqual(app!.locales.en!.count_files, COUNT)
    await i18n.writeLocale('apps/app', 'en', app!.locales.en!)
    assert.deepStrictEqual((await json(root, 'en')).count_files, COUNT)
    const [check] = await i18n.check('apps/app', { strict: true })
    assert.strictEqual(check!.ok, true)
  })

  test('setPlural writes one key in every locale; a locale not given gets a marked copy of the same shape', async () => {
    const root = await fixture({ en: { a: 'A' }, de: { a: 'A' } })
    const i18n = new I18nService(root)
    const r = await i18n.setPlural('apps/app', 'count_files', {
      en: { one: '{count} file', other: '{count} files' },
    })
    assert.deepStrictEqual(
      r.files.map((f) => [f.locale, f.marked]),
      [
        ['de', true],
        ['en', false],
      ]
    )
    assert.deepStrictEqual((await json(root, 'en')).count_files, COUNT)
    const de = (await json(root, 'de')).count_files
    assert.deepStrictEqual(Object.keys(de[0].match), [
      'countPlural=one',
      'countPlural=other',
    ])
    assert.ok(de[0].match['countPlural=one'].startsWith(MISSING_MARKER))
    await i18n.setPlural(
      'apps/app',
      'count_files',
      {
        en: { one: '{count} file', other: '{count} files' },
        de: { one: '{count} Datei', other: '{count} Dateien' },
      },
      { update: true }
    )
    const [check] = await i18n.check('apps/app', { strict: true })
    assert.strictEqual(check!.ok, true)
    assert.strictEqual(check!.warnings, 0)
  })

  test('setKey accepts the array shape; setPlural refuses a category the locale lacks, a missing other, placeholder drift', async () => {
    const root = await fixture({ en: { a: 'A' }, de: { a: 'A' } })
    const i18n = new I18nService(root)
    await i18n.setKey('apps/app', 'n', { en: COUNT as never })
    assert.deepStrictEqual((await json(root, 'en')).n, COUNT)
    await assert.rejects(
      i18n.setPlural('apps/app', 'k1', {
        en: { one: '{count} a', other: '{count} as' },
        de: { one: '{count} a', few: '{count} b', other: '{count} c' },
      }),
      /de has no plural "few"/
    )
    await assert.rejects(
      i18n.setPlural('apps/app', 'k2', { en: { one: '{count} a' } }),
      /no "countPlural=other"/
    )
    await assert.rejects(
      i18n.setPlural('apps/app', 'k3', {
        en: { one: '{count} a', other: '{count} as' },
        de: { one: 'a {name}', other: 'b' },
      }),
      /uses/
    )
    assert.strictEqual((await json(root, 'en')).k1, undefined)
  })

  test('check: unknown category and missing other are errors, a missing category is a warning', async () => {
    const root = await fixture(
      {
        en: { count_files: COUNT },
        de: {
          count_files: plural({
            one: '{count} Datei',
            few: '{count} Dateien',
          }),
        },
        ar: { count_files: plural({ one: '{count}', other: '{count}' }) },
      },
      ['en', 'de', 'ar']
    )
    const [r] = await new I18nService(root).check('apps/app')
    const c = r.catalogs[0]
    assert.deepStrictEqual(
      c.plural.map((p) => [p.locale, p.problem, p.categories]),
      [
        ['ar', 'missing-category', ['zero', 'two', 'few', 'many']],
        ['de', 'missing-other', []],
        ['de', 'unknown-category', ['few']],
      ]
    )
    assert.strictEqual(r.errors, 2)
    assert.strictEqual(r.warnings, 1)
    assert.strictEqual(r.ok, false)
  })

  test('check: Arabic with every category is clean; placeholder drift is caught across kinds', async () => {
    const root = await fixture(
      {
        en: { count_files: COUNT, plain: 'Hi {name}' },
        ar: {
          count_files: plural({
            zero: '{count}',
            one: '{count}',
            two: '{count}',
            few: '{count}',
            many: '{count}',
            other: '{count}',
          }),
          plain: plural({ other: 'x' }),
        },
      },
      ['en', 'ar']
    )
    const [r] = await new I18nService(root).check('apps/app', { strict: true })
    assert.deepStrictEqual(
      r.catalogs[0]!.placeholders.map((p) => p.key),
      ['plain']
    )
    assert.deepStrictEqual(
      r.catalogs[0]!.plural.map((p) => p.key),
      ['plain']
    )
  })

  test('check counts a marked plural as one untranslated key', async () => {
    const root = await fixture({ en: { n: COUNT }, de: { n: COUNT } }, [
      'en',
      'de',
    ])
    const i18n = new I18nService(root)
    await writeFile(join(root, MSGS, 'de.json'), JSON.stringify({}))
    await i18n.sync('apps/app')
    const [r] = await i18n.check('apps/app')
    assert.deepStrictEqual(r.catalogs[0]!.untranslated, { de: 1 })
    assert.strictEqual(r.warnings, 1)
  })

  test('usage, unused and move treat a plural as one key', async () => {
    const root = await fixture({
      en: { n: COUNT, other_key: 'x' },
      de: {
        n: plural({ one: '{count} D', other: '{count} Ds' }),
        other_key: 'y',
      },
    })
    await mkdir(join(root, 'apps/app/src'), { recursive: true })
    await writeFile(
      join(root, 'apps/app/src/a.ts'),
      `import { m } from './m'\nexport const a = m.n({ count: 2 })\n`
    )
    const i18n = new I18nService(root)
    const [u] = (await i18n.usage('apps/app')).apps
    assert.deepStrictEqual(
      u!.catalogs[0]!.keys.map((k) => [k.key, k.files.length]),
      [
        ['n', 1],
        ['other_key', 0],
      ]
    )
    const unused = await i18n.unused('apps/app')
    assert.deepStrictEqual(unused.apps[0]!.catalogs[0]!.unused, ['other_key'])
    assert.strictEqual(unused.apps[0]!.catalogs[0]!.keys, 2)

    // move to a second catalog
    await writeFile(
      join(root, 'apps/app/project.inlang/settings.json'),
      JSON.stringify({
        baseLocale: 'en',
        locales: ['en', 'de'],
        'plugin.inlang.messageFormat': {
          pathPattern: ['./messages/{locale}.json', './more/{locale}.json'],
        },
      })
    )
    await mkdir(join(root, 'apps/app/more'), { recursive: true })
    await writeFile(
      join(root, 'apps/app/more/en.json'),
      JSON.stringify({ z: 'Z' })
    )
    await writeFile(
      join(root, 'apps/app/more/de.json'),
      JSON.stringify({ z: 'Z' })
    )
    const r = await i18n.move('apps/app', ['n'], 'apps/app/more')
    assert.deepStrictEqual(r.moved, [
      { key: 'n', from: MSGS, locales: ['de', 'en'], marked: [] },
    ])
    const en = JSON.parse(
      await readFile(join(root, 'apps/app/more/en.json'), 'utf-8')
    )
    assert.deepStrictEqual(en.n, COUNT)
    assert.strictEqual((await json(root, 'en')).n, undefined)
    const [c] = await i18n.check('apps/app', { strict: true })
    assert.strictEqual(c!.ok, true)
    // duplicate detection sees a plural key in two catalogs as one duplicated key
    await writeFile(
      join(root, 'apps/app/messages/en.json'),
      JSON.stringify({ n: COUNT, other_key: 'x' })
    )
    const [d] = await i18n.check('apps/app')
    assert.deepStrictEqual(
      d!.duplicates.map((x) => x.key),
      ['n']
    )
  })
})
