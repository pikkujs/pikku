import { test } from 'node:test'
import * as assert from 'node:assert'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createNestedProjectFilter } from './nested-project-filter.js'

test('createNestedProjectFilter', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'pikku-nested-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  writeFileSync(join(root, 'pikku.config.json'), '{}')
  mkdirSync(join(root, 'packages/functions/src'), { recursive: true })
  mkdirSync(join(root, 'packages/addon/src'), { recursive: true })
  mkdirSync(join(root, 'packages/addon/types'), { recursive: true })
  writeFileSync(join(root, 'packages/addon/pikku.config.json'), '{}')

  const isNested = createNestedProjectFilter(root)

  await t.test('keeps project source files', () => {
    assert.strictEqual(
      isNested(join(root, 'packages/functions/src/auth.ts')),
      false
    )
  })

  await t.test('keeps files directly under rootDir', () => {
    assert.strictEqual(isNested(join(root, 'services.ts')), false)
  })

  await t.test('excludes files inside a nested pikku project', () => {
    assert.strictEqual(
      isNested(join(root, 'packages/addon/types/application-types.d.ts')),
      true
    )
    assert.strictEqual(
      isNested(join(root, 'packages/addon/src/index.ts')),
      true
    )
  })

  await t.test('keeps files outside rootDir untouched', () => {
    assert.strictEqual(isNested('/somewhere/else/file.ts'), false)
  })

  await t.test('rootDir itself is not treated as nested', () => {
    const addonScoped = createNestedProjectFilter(join(root, 'packages/addon'))
    assert.strictEqual(
      addonScoped(join(root, 'packages/addon/src/index.ts')),
      false
    )
  })
})
