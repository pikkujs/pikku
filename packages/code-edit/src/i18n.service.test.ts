import assert from 'node:assert'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { I18nService, INLANG_SCHEMA, MISSING_MARKER } from './i18n.service.js'

const workspace = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-i18n-'))
  const app = join(root, 'apps/app')
  await mkdir(join(app, 'project.inlang'), { recursive: true })
  await mkdir(join(app, 'messages'), { recursive: true })
  await mkdir(join(app, 'src/i18n'), { recursive: true })
  await mkdir(join(root, 'node_modules/x/project.inlang'), { recursive: true })
  await writeFile(
    join(root, 'node_modules/x/project.inlang/settings.json'),
    '{}'
  )
  await writeFile(
    join(app, 'project.inlang/settings.json'),
    JSON.stringify({
      baseLocale: 'en',
      locales: ['en'],
      'plugin.inlang.messageFormat': {
        pathPattern: './messages/{locale}.json',
      },
    })
  )
  await writeFile(
    join(app, 'messages/en.json'),
    JSON.stringify({ $schema: 'x', hello: 'Hello', bye: 'Bye' })
  )
  await writeFile(
    join(app, 'src/i18n/active.json'),
    JSON.stringify({ defaultLocale: 'en' })
  )
  return root
}

const json = async (path: string) => JSON.parse(await readFile(path, 'utf-8'))

describe('I18nService', () => {
  test('finds inlang apps and their catalogs, skipping node_modules', async () => {
    const root = await workspace()
    const [app, ...rest] = await new I18nService(root).listApps()
    assert.strictEqual(rest.length, 0)
    assert.deepStrictEqual(app, {
      app: 'apps/app',
      messagesDir: 'apps/app/messages',
      baseLocale: 'en',
      defaultLocale: 'en',
      locales: { en: { hello: 'Hello', bye: 'Bye' } },
      catalogs: [
        {
          catalog: 'apps/app/messages',
          locales: { en: { hello: 'Hello', bye: 'Bye' } },
        },
      ],
      duplicates: [],
    })
  })

  test('adds a locale seeded from the base and registers it', async () => {
    const root = await workspace()
    const i18n = new I18nService(root)
    const added = await i18n.addLocale('apps/app', 'de', { hello: 'Hallo' })
    assert.deepStrictEqual(added, {
      path: 'apps/app/messages/de.json',
      keys: 2,
      translated: 1,
      files: [
        {
          catalog: 'apps/app/messages',
          path: 'apps/app/messages/de.json',
          keys: 2,
          translated: 1,
        },
      ],
    })
    assert.deepStrictEqual(
      await json(join(root, 'apps/app/messages/de.json')),
      {
        $schema: INLANG_SCHEMA,
        bye: `${MISSING_MARKER} Bye`,
        hello: 'Hallo',
      }
    )
    assert.deepStrictEqual(
      (await json(join(root, 'apps/app/project.inlang/settings.json'))).locales,
      ['en', 'de']
    )
    await assert.rejects(i18n.addLocale('apps/app', 'de'))
    await i18n.setDefaultLocale('apps/app', 'de')
    assert.strictEqual(
      (await json(join(root, 'apps/app/src/i18n/active.json'))).defaultLocale,
      'de'
    )
    await assert.rejects(i18n.setDefaultLocale('apps/app', 'fr'))
  })

  test('syncs missing keys and reports stale ones, then deletes the locale', async () => {
    const root = await workspace()
    const i18n = new I18nService(root)
    await i18n.writeLocale('apps/app', 'fr', { hello: 'Bonjour', old: 'Vieux' })
    const [report] = await i18n.sync()
    assert.deepStrictEqual(report, {
      app: 'apps/app',
      catalog: 'apps/app/messages',
      locale: 'fr',
      added: ['bye'],
      stale: ['old'],
      untranslated: 1,
    })
    await assert.rejects(i18n.deleteLocale('apps/app', 'en'))
    await i18n.deleteLocale('apps/app', 'fr')
    assert.deepStrictEqual(
      (await json(join(root, 'apps/app/project.inlang/settings.json'))).locales,
      ['en']
    )
    await assert.rejects(i18n.writeLocale('../..', 'de', {}))
    await assert.rejects(i18n.writeLocale('apps/app', '../x', {}))
  })
})

const multi = async (
  pathPattern: string | string[],
  shared: Record<string, string> = { card: 'Card' }
): Promise<string> => {
  const root = await workspace()
  await writeFile(
    join(root, 'apps/app/project.inlang/settings.json'),
    JSON.stringify({
      baseLocale: 'en',
      locales: ['en'],
      'plugin.inlang.messageFormat': { pathPattern },
    })
  )
  await mkdir(join(root, 'packages/ui/messages'), { recursive: true })
  await writeFile(
    join(root, 'packages/ui/messages/en.json'),
    JSON.stringify(shared)
  )
  return root
}

const both = [
  './messages/{locale}.json',
  '../../packages/ui/messages/{locale}.json',
]

describe('I18nService with several catalogs', () => {
  test('accepts a string or an array pathPattern', async () => {
    const [one] = await new I18nService(
      await multi('./messages/{locale}.json')
    ).listApps()
    assert.strictEqual(one!.catalogs.length, 1)
    const [two] = await new I18nService(await multi(both)).listApps()
    assert.deepStrictEqual(
      two!.catalogs.map((c) => c.catalog),
      ['apps/app/messages', 'packages/ui/messages']
    )
    assert.deepStrictEqual(two!.locales.en, {
      hello: 'Hello',
      bye: 'Bye',
      card: 'Card',
    })
    assert.deepStrictEqual(two!.duplicates, [])
  })

  test('add and sync work per catalog against its own base', async () => {
    const root = await multi(both)
    const i18n = new I18nService(root)
    const result = await i18n.addLocale('apps/app', 'de', { card: 'Karte' })
    assert.deepStrictEqual(
      result.files.map((f) => [f.catalog, f.keys, f.translated]),
      [
        ['apps/app/messages', 2, 0],
        ['packages/ui/messages', 1, 1],
      ]
    )
    assert.deepStrictEqual(
      await json(join(root, 'packages/ui/messages/de.json')),
      {
        $schema: INLANG_SCHEMA,
        card: 'Karte',
      }
    )
    await writeFile(
      join(root, 'packages/ui/messages/en.json'),
      JSON.stringify({ card: 'Card', more: 'More' })
    )
    const report = await i18n.sync('apps/app')
    assert.deepStrictEqual(
      report.map((r) => [r.catalog, r.added]),
      [
        ['apps/app/messages', []],
        ['packages/ui/messages', ['more']],
      ]
    )
    assert.deepStrictEqual(
      (await json(join(root, 'packages/ui/messages/de.json'))).more,
      `${MISSING_MARKER} More`
    )
    assert.strictEqual(
      (await json(join(root, 'apps/app/messages/de.json'))).card,
      undefined
    )
  })

  test('single-key writes need a catalog unless the keys name one', async () => {
    const root = await multi(both)
    const i18n = new I18nService(root)
    await assert.rejects(
      i18n.writeLocale('apps/app', 'de', { newKey: 'x' }),
      /apps\/app\/messages, packages\/ui\/messages/
    )
    await assert.rejects(i18n.deleteLocale('apps/app', 'de'))
    await assert.rejects(
      i18n.writeLocale('apps/app', 'de', { hello: 'a', card: 'b' })
    )
    assert.strictEqual(
      await i18n.writeLocale('apps/app', 'de', { card: 'Karte' }),
      'packages/ui/messages/de.json'
    )
    assert.strictEqual(
      await i18n.writeLocale(
        'apps/app',
        'fr',
        { newKey: 'x' },
        'apps/app/messages'
      ),
      'apps/app/messages/fr.json'
    )
    await assert.rejects(i18n.writeLocale('apps/app', 'it', {}, 'nope'))
    await i18n.deleteLocale('apps/app', 'de', 'packages/ui/messages')
  })

  test('duplicate keys are reported and block add and sync', async () => {
    const root = await multi(both, { card: 'Card', hello: 'Hi' })
    const i18n = new I18nService(root)
    const [app] = await i18n.listApps()
    assert.deepStrictEqual(app!.duplicates, [
      { key: 'hello', catalogs: ['apps/app/messages', 'packages/ui/messages'] },
    ])
    await assert.rejects(i18n.addLocale('apps/app', 'de'), /hello/)
    await assert.rejects(i18n.sync('apps/app'), /hello/)
  })
})
