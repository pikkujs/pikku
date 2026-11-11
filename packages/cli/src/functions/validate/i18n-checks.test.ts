import assert from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'
import { MISSING_MARKER } from '@pikku/code-edit/i18n'
import { runI18nChecks } from './i18n-checks.js'
import { planValidation } from './validate-registry.js'

const write = async (root: string, rel: string, text: string) => {
  const path = join(root, rel)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text, 'utf8')
}

const app = async (
  live: string[],
  messages: Record<string, Record<string, unknown>>
): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-i18n-validate-'))
  await write(
    root,
    'project.inlang/settings.json',
    JSON.stringify({
      baseLocale: 'en',
      locales: live,
      'plugin.inlang.messageFormat': {
        pathPattern: './messages/{locale}.json',
      },
    })
  )
  for (const [locale, m] of Object.entries(messages))
    await write(root, `messages/${locale}.json`, JSON.stringify(m))
  return root
}

const base = { hello: 'Hello {name}', bye: 'Bye' }

describe('i18n validate check', () => {
  test('a live locale missing a key fails', async () => {
    const root = await app(['en', 'de'], {
      en: base,
      de: { hello: 'Hallo {name}' },
    })
    try {
      const findings = await runI18nChecks(root)
      assert.deepStrictEqual(
        findings.map((f) => f.id),
        ['i18n-missing-translation']
      )
      assert.strictEqual(findings[0]!.severity, 'error')
      assert.match(findings[0]!.message, /de is live.*bye/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('a locale that is not live is skipped', async () => {
    const root = await app(['en'], {
      en: base,
      de: { hello: 'Hallo {name}', old: 'x', bye: `${MISSING_MARKER}Bye` },
    })
    try {
      assert.deepStrictEqual(await runI18nChecks(root), [])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('marked, placeholder-mismatched and stale values in a live locale fail', async () => {
    const root = await app(['en', 'de'], {
      en: base,
      de: { hello: 'Hallo {who}', bye: `${MISSING_MARKER}Bye`, old: 'x' },
    })
    try {
      const ids = (await runI18nChecks(root)).map((f) => f.id).sort()
      assert.deepStrictEqual(ids, [
        'i18n-placeholder-mismatch',
        'i18n-stale-key',
        'i18n-untranslated',
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('a fully translated live locale is clean', async () => {
    const root = await app(['en', 'de'], {
      en: base,
      de: { hello: 'Hallo {name}', bye: 'Tschüss' },
    })
    try {
      assert.deepStrictEqual(await runI18nChecks(root), [])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('is planned only where an inlang project exists', async () => {
    const withApp = await app(['en'], { en: base })
    const without = await mkdtemp(join(tmpdir(), 'pikku-i18n-none-'))
    await write(without, 'package.json', '{"name":"x"}')
    try {
      await write(withApp, 'package.json', '{"name":"x"}')
      const has = (r: string) =>
        planValidation(r).then((p) => p.some((x) => x.check.id === 'i18n'))
      assert.strictEqual(await has(withApp), true)
      assert.strictEqual(await has(without), false)
    } finally {
      await rm(withApp, { recursive: true, force: true })
      await rm(without, { recursive: true, force: true })
    }
  })
})
