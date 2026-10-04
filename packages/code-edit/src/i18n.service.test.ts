import assert from 'node:assert'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { I18nService, MISSING_MARKER } from './i18n.service.js'

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
    })
    assert.deepStrictEqual(
      await json(join(root, 'apps/app/messages/de.json')),
      {
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
