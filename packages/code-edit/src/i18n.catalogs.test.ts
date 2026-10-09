import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { I18nService, INLANG_SCHEMA, MISSING_MARKER } from './i18n.service.js'

const APP = 'apps/app/messages'
const UI = 'packages/ui/messages'

const write = async (root: string, path: string, content: unknown) => {
  const abs = join(root, path)
  await mkdir(join(abs, '..'), { recursive: true })
  await writeFile(
    abs,
    typeof content === 'string'
      ? content
      : JSON.stringify(content, null, 2) + '\n'
  )
}
const json = async (root: string, path: string) =>
  JSON.parse(await readFile(join(root, path), 'utf-8'))

/** One app with two catalogs (its own and packages/ui), en + de each, and sources in a third package. */
const fixture = async (git = false): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-i18n-cat-'))
  await write(root, 'apps/app/project.inlang/settings.json', {
    baseLocale: 'en',
    locales: ['en', 'de'],
    'plugin.inlang.messageFormat': {
      pathPattern: [
        './messages/{locale}.json',
        '../../packages/ui/messages/{locale}.json',
      ],
    },
  })
  await write(root, `${APP}/en.json`, {
    $schema: 'x',
    greeting: 'Hello {name}',
    used_here: 'Here',
    dead_app: 'Dead',
  })
  await write(root, `${APP}/de.json`, {
    $schema: 'x',
    greeting: 'Hallo {name}',
    used_here: 'Hier',
    dead_app: 'Tot',
  })
  await write(root, `${UI}/en.json`, {
    card: 'Card',
    only_from_other: 'Other',
    dead_ui: 'Dead',
  })
  await write(root, `${UI}/de.json`, {
    card: 'Karte',
    only_from_other: 'Anderes',
    dead_ui: 'Tot',
  })
  await write(
    root,
    'apps/app/src/a.tsx',
    `import { m } from '@/i18n/messages'
export const a = [m.greeting({ name: 'x' }), m['used_here'](), m.card]
`
  )
  await write(
    root,
    'packages/other/src/b.ts',
    `import * as msgs from '../../apps/app/src/paraglide/messages.js'
export const b = () => msgs.only_from_other()
`
  )
  await write(
    root,
    'packages/ui/node_modules/x/c.ts',
    `import { m } from 'x'; m.dead_ui()`
  )
  await write(root, '.agents/copy/d.ts', `import { m } from 'x'; m.dead_ui()`)
  if (git) {
    const run = (...a: string[]) =>
      execFileSync('git', a, { cwd: root, stdio: 'ignore' })
    run('init', '-q')
    run('add', '-A')
    run('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'x')
  }
  return root
}

describe('I18nService.setKey', () => {
  test('adds to the chosen catalog in every locale, sorted, marking untranslated ones', async () => {
    const root = await fixture()
    const i18n = new I18nService(root)
    const r = await i18n.setKey(
      'apps/app',
      'account__title',
      { en: 'Your account' },
      { catalog: UI }
    )
    assert.strictEqual(r.action, 'added')
    assert.strictEqual(r.catalog, UI)
    assert.deepStrictEqual(
      r.files.map((f) => [f.locale, f.marked]),
      [
        ['de', true],
        ['en', false],
      ]
    )
    const de = await json(root, `${UI}/de.json`)
    assert.strictEqual(de.account__title, `${MISSING_MARKER} Your account`)
    assert.deepStrictEqual(Object.keys(de), [
      '$schema',
      'account__title',
      'card',
      'dead_ui',
      'only_from_other',
    ])
    await i18n.setKey(
      'apps/app',
      'account__title',
      { en: 'Account', de: 'Konto' },
      { update: true }
    )
    assert.strictEqual(
      (await json(root, `${UI}/de.json`)).account__title,
      'Konto'
    )
    assert.strictEqual(
      (await json(root, `${APP}/de.json`)).account__title,
      undefined
    )
  })

  test('refuses an ambiguous catalog, an existing key, a bad name and placeholder drift', async () => {
    const root = await fixture()
    const i18n = new I18nService(root)
    await assert.rejects(
      i18n.setKey('apps/app', 'fresh', { en: 'x' }),
      new RegExp(`${APP}, ${UI}`)
    )
    await assert.rejects(
      i18n.setKey('apps/app', 'card', { en: 'x' }, { catalog: APP }),
      /already exists in packages\/ui\/messages/
    )
    await assert.rejects(
      i18n.setKey(
        'apps/app',
        'card',
        { en: 'x' },
        { update: true, catalog: APP }
      ),
      /lives in/
    )
    await assert.rejects(
      i18n.setKey('apps/app', 'Bad-Name', { en: 'x' }, { catalog: APP }),
      /not a valid message key/
    )
    await assert.rejects(
      i18n.setKey('apps/app', 'fresh', { de: 'x' }, { catalog: APP }),
      /text is required/
    )
    await assert.rejects(
      i18n.setKey('apps/app', 'fresh', { en: 'x', fr: 'y' }, { catalog: APP }),
      /not one of/
    )
    await assert.rejects(
      i18n.setKey(
        'apps/app',
        'fresh',
        { en: 'Hi {name}', de: 'Hallo {nom}' },
        { catalog: APP }
      ),
      /de uses \{nom\} but en uses \{name\}/
    )
    // updating only the base text would leave a kept locale with the wrong placeholders
    await assert.rejects(
      i18n.setKey('apps/app', 'greeting', { en: 'Hi' }, { update: true }),
      /de uses \{name\} but en uses none/
    )
    assert.strictEqual((await json(root, `${APP}/en.json`)).fresh, undefined)
  })

  test('update without a catalog finds the holder and keeps locales not given', async () => {
    const root = await fixture()
    const i18n = new I18nService(root)
    const r = await i18n.setKey(
      'apps/app',
      'card',
      { en: 'Card!' },
      { update: true }
    )
    assert.deepStrictEqual(
      [r.catalog, r.action, r.kept],
      [UI, 'updated', ['de']]
    )
    assert.strictEqual((await json(root, `${UI}/de.json`)).card, 'Karte')
  })

  test('refuses while a key is duplicated across catalogs', async () => {
    const root = await fixture()
    await write(root, `${UI}/en.json`, { card: 'Card', used_here: 'x' })
    await assert.rejects(
      new I18nService(root).setKey(
        'apps/app',
        'fresh',
        { en: 'x' },
        { catalog: APP }
      ),
      /used_here/
    )
  })
})

describe('I18nService.check', () => {
  test('a clean app passes; marked values only fail with strict', async () => {
    const root = await fixture()
    const i18n = new I18nService(root)
    const [clean] = await i18n.check('apps/app', { strict: true })
    assert.strictEqual(clean!.ok, true)
    await i18n.setKey('apps/app', 'fresh', { en: 'New' }, { catalog: APP })
    const [loose] = await i18n.check('apps/app')
    assert.deepStrictEqual(
      [loose!.ok, loose!.warnings, loose!.errors],
      [true, 1, 0]
    )
    assert.deepStrictEqual(loose!.catalogs[0]!.untranslated, { de: 1 })
    const [strict] = await i18n.check('apps/app', { strict: true })
    assert.strictEqual(strict!.ok, false)
  })

  test('duplicates, placeholder drift and stale keys are errors', async () => {
    const root = await fixture()
    await write(root, `${UI}/en.json`, { card: 'Card', used_here: 'x' })
    await write(root, `${APP}/de.json`, {
      greeting: 'Hallo {nom}',
      used_here: 'Hier',
      ghost: 'Geist',
    })
    const [r] = await new I18nService(root).check('apps/app')
    assert.strictEqual(r!.ok, false)
    assert.deepStrictEqual(
      r!.duplicates.map((d) => d.key),
      ['used_here']
    )
    const app = r!.catalogs.find((c) => c.catalog === APP)!
    assert.deepStrictEqual(app.placeholders, [
      { key: 'greeting', locale: 'de', base: ['name'], found: ['nom'] },
    ])
    assert.deepStrictEqual(app.stale, [{ locale: 'de', keys: ['ghost'] }])
  })
})

describe('I18nService.unused', () => {
  test('finds keys no source uses; use from another package counts; vendor and dot dirs are skipped', async () => {
    const root = await fixture()
    const r = await new I18nService(root).unused('apps/app')
    assert.deepStrictEqual(r.computed, [])
    assert.deepStrictEqual(
      r.apps[0]!.catalogs.map((c) => [c.catalog, c.unused]),
      [
        [APP, ['dead_app']],
        [UI, ['dead_ui']],
      ]
    )
  })

  test('computed access to the namespace stops it and reports where', async () => {
    const root = await fixture()
    await write(
      root,
      'apps/app/src/c.ts',
      `import { m } from '../i18n/messages'\nexport const f = (k: string) => (m as any)[k]()\nexport const g = (k: string) => m[k as 'x']()\nexport const h = m\n`
    )
    const r = await new I18nService(root).unused()
    assert.strictEqual(r.computed.length, 3)
    assert.deepStrictEqual(
      r.computed.map((c) => c.line),
      [2, 3, 4]
    )
    assert.deepStrictEqual(
      r.apps[0]!.catalogs.map((c) => c.unused),
      [[], []]
    )
    await assert.rejects(
      new I18nService(root).unused(undefined, { fix: true }),
      /computed access/
    )
  })

  test('destructuring names its keys; rest does not', async () => {
    const root = await fixture()
    await write(
      root,
      'apps/app/src/d.ts',
      `import { m } from '@/i18n/messages'\nconst { dead_app, card: c } = m\nexport { dead_app, c }\n`
    )
    const r = await new I18nService(root).unused('apps/app')
    assert.deepStrictEqual(r.computed, [])
    assert.deepStrictEqual(
      r.apps[0]!.catalogs.map((c) => c.unused),
      [[], ['dead_ui']]
    )
  })

  test('--fix removes the keys from every locale file of their catalog', async () => {
    const root = await fixture(true)
    const r = await new I18nService(root).unused('apps/app', { fix: true })
    assert.deepStrictEqual(
      r.removed.map((x) => [x.catalog, x.keys, x.files]),
      [
        [APP, ['dead_app'], [`${APP}/de.json`, `${APP}/en.json`]],
        [UI, ['dead_ui'], [`${UI}/de.json`, `${UI}/en.json`]],
      ]
    )
    assert.deepStrictEqual(await json(root, `${APP}/de.json`), {
      $schema: 'x',
      greeting: 'Hallo {name}',
      used_here: 'Hier',
    })
    assert.deepStrictEqual(Object.keys(await json(root, `${UI}/en.json`)), [
      '$schema',
      'card',
      'only_from_other',
    ])
  })

  test('--fix refuses on a dirty tree, with duplicates, or unparsed sources', async () => {
    const root = await fixture(true)
    await write(root, `${APP}/en.json`, {
      greeting: 'Hello {name}',
      used_here: 'Here',
      dead_app: 'Dead',
      extra: 'x',
    })
    await assert.rejects(
      new I18nService(root).unused('apps/app', { fix: true }),
      /uncommitted changes/
    )
    await assert.rejects(
      new I18nService(root).unused('apps/app', { fix: true, force: true }),
      /uncommitted changes/
    )
    assert.strictEqual((await json(root, `${UI}/en.json`)).dead_ui, 'Dead')

    const broken = await fixture(true)
    await write(broken, 'apps/app/src/bad.ts', 'export const = (')
    await assert.rejects(
      new I18nService(broken).unused('apps/app', { fix: true }),
      /did not parse/
    )
  })

  test('--fix without git needs force', async () => {
    const root = await fixture(false)
    await assert.rejects(
      new I18nService(root).unused('apps/app', { fix: true }),
      /git is not available/
    )
    const r = await new I18nService(root).unused('apps/app', {
      fix: true,
      force: true,
    })
    assert.strictEqual(r.removed.length, 2)
  })
})

describe('I18nService.move', () => {
  test('moves one key in every locale, keeping $schema, other entries and each file format', async () => {
    const root = await fixture()
    const r = await new I18nService(root).move('apps/app', ['greeting'], UI)
    assert.deepStrictEqual(r.moved, [
      { key: 'greeting', from: APP, locales: ['de', 'en'], marked: [] },
    ])
    assert.strictEqual(r.to, UI)
    assert.deepStrictEqual(r.created, [])
    assert.deepStrictEqual(r.files, [
      `${APP}/de.json`,
      `${APP}/en.json`,
      `${UI}/de.json`,
      `${UI}/en.json`,
    ])
    assert.deepStrictEqual(await json(root, `${APP}/en.json`), {
      $schema: 'x',
      used_here: 'Here',
      dead_app: 'Dead',
    })
    const de = await json(root, `${UI}/de.json`)
    assert.strictEqual(de.greeting, 'Hallo {name}')
    assert.deepStrictEqual(Object.keys(de), [
      '$schema',
      'card',
      'dead_ui',
      'greeting',
      'only_from_other',
    ])
    assert.ok(
      (await readFile(join(root, `${UI}/en.json`), 'utf-8')).endsWith('}\n')
    )
    const [check] = await new I18nService(root).check('apps/app', {
      strict: true,
    })
    assert.strictEqual(check!.ok, true)
  })

  test('moves several keys, de-duplicated, from different catalogs', async () => {
    const root = await fixture()
    // greeting + used_here live in APP; card lives in UI. Move UI's card and APP's used_here to a third place is not possible, so swap directions.
    const i18n = new I18nService(root)
    const r = await i18n.move(
      'apps/app',
      ['used_here', 'dead_app', 'used_here'],
      UI
    )
    assert.deepStrictEqual(
      r.moved.map((m) => m.key),
      ['used_here', 'dead_app']
    )
    assert.deepStrictEqual(Object.keys(await json(root, `${APP}/en.json`)), [
      '$schema',
      'greeting',
    ])
    const back = await i18n.move('apps/app', ['card', 'used_here'], APP)
    assert.deepStrictEqual(
      back.moved.map((m) => [m.key, m.from]),
      [
        ['card', UI],
        ['used_here', UI],
      ]
    )
    assert.strictEqual((await json(root, `${APP}/de.json`)).card, 'Karte')
  })

  test('refuses a missing key, a key already in the target, a bad target, no keys', async () => {
    const root = await fixture()
    const i18n = new I18nService(root)
    await assert.rejects(
      i18n.move('apps/app', ['nope'], UI),
      /nope is in no catalog/
    )
    await assert.rejects(
      i18n.move('apps/app', ['card'], UI),
      /card is already in packages\/ui\/messages/
    )
    await assert.rejects(
      i18n.move('apps/app', ['card'], 'packages/zzz/messages'),
      /Unknown catalog.*apps\/app\/messages, packages\/ui\/messages/
    )
    await assert.rejects(i18n.move('apps/app', [], UI), /at least one key/)
  })

  test('refuses while a key is duplicated', async () => {
    const root = await fixture()
    await write(root, `${UI}/en.json`, { card: 'Card', used_here: 'x' })
    await assert.rejects(
      new I18nService(root).move('apps/app', ['greeting'], UI),
      /used_here/
    )
  })

  test('all or nothing: one bad key leaves every file as it was', async () => {
    const root = await fixture()
    const files = [
      `${APP}/en.json`,
      `${APP}/de.json`,
      `${UI}/en.json`,
      `${UI}/de.json`,
    ]
    const snap = async () =>
      Promise.all(files.map((f) => readFile(join(root, f), 'utf-8')))
    const before = await snap()
    await assert.rejects(
      new I18nService(root).move('apps/app', ['greeting', 'nope', 'card'], UI)
    )
    assert.deepStrictEqual(await snap(), before)
    // a key with no base text cannot be moved either
    await write(root, `${APP}/en.json`, { $schema: 'x', used_here: 'Here' })
    await write(root, `${APP}/de.json`, {
      greeting: 'Hallo',
      used_here: 'Hier',
    })
    const again = await snap()
    await assert.rejects(
      new I18nService(root).move('apps/app', ['used_here', 'greeting'], UI),
      /greeting has no en/
    )
    assert.deepStrictEqual(await snap(), again)
  })

  test('a target locale the source lacks gets the marked base text', async () => {
    const root = await fixture()
    await write(root, `${UI}/fr.json`, { card: 'Carte' })
    const r = await new I18nService(root).move('apps/app', ['greeting'], UI)
    assert.deepStrictEqual(r.moved[0]!.marked, ['fr'])
    assert.strictEqual(
      (await json(root, `${UI}/fr.json`)).greeting,
      `${MISSING_MARKER} Hello {name}`
    )
  })

  test('a source locale the target lacks is created, seeded like add, and registered', async () => {
    const root = await fixture()
    await write(root, `${APP}/fr.json`, { greeting: 'Bonjour {name}' })
    await write(root, 'apps/app/project.inlang/settings.json', {
      baseLocale: 'en',
      locales: ['en', 'de'],
      'plugin.inlang.messageFormat': {
        pathPattern: [
          './messages/{locale}.json',
          '../../packages/ui/messages/{locale}.json',
        ],
      },
    })
    const r = await new I18nService(root).move('apps/app', ['greeting'], UI)
    assert.deepStrictEqual(r.created, [`${UI}/fr.json`])
    assert.deepStrictEqual(await json(root, `${UI}/fr.json`), {
      $schema: INLANG_SCHEMA,
      card: `${MISSING_MARKER} Card`,
      dead_ui: `${MISSING_MARKER} Dead`,
      greeting: 'Bonjour {name}',
      only_from_other: `${MISSING_MARKER} Other`,
    })
    const settings = await json(root, 'apps/app/project.inlang/settings.json')
    assert.ok(settings.locales.includes('fr'))
    assert.deepStrictEqual(await json(root, `${APP}/fr.json`), {
      $schema: INLANG_SCHEMA,
    })
  })
})

describe('I18nService.usage', () => {
  test('lists the files and packages per key, including a key used from two packages', async () => {
    const root = await fixture()
    await write(
      root,
      'packages/other/src/e.ts',
      `import { m } from 'x/i18n/messages'\nexport const e = m.card\n`
    )
    const r = await new I18nService(root).usage('apps/app')
    assert.deepStrictEqual(r.computed, [])
    const keys = Object.fromEntries(
      r.apps[0]!.catalogs.flatMap((c) => c.keys).map((k) => [k.key, k])
    )
    assert.deepStrictEqual(keys.greeting!.packages, ['apps/app'])
    assert.deepStrictEqual(keys.greeting!.files, ['apps/app/src/a.tsx'])
    assert.deepStrictEqual(keys.card!.packages, ['apps/app', 'packages/other'])
    assert.deepStrictEqual(keys.only_from_other!.packages, ['packages/other'])
    assert.deepStrictEqual(keys.dead_ui!.packages, [])
    const only = await new I18nService(root).usage('apps/app', { catalog: UI })
    assert.deepStrictEqual(
      only.apps[0]!.catalogs.map((c) => c.catalog),
      [UI]
    )
  })
})
