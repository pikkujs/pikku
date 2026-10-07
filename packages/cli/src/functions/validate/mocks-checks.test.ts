import assert from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'
import { runMocksChecks, usesMocks } from './mocks-checks.js'
import { planValidation } from './validate-registry.js'

const write = async (root: string, rel: string, text: string) => {
  const path = join(root, rel)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text, 'utf8')
}

const project = async (files: Record<string, string>): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pikku-mocks-validate-'))
  await write(root, 'package.json', '{"name":"app","workspaces":["apps/*"]}')
  await write(root, 'pikku.config.json', '{"outDir":".pikku"}')
  await write(root, '.pikku/function/pikku-functions-meta.gen.json', '{}')
  for (const [rel, text] of Object.entries(files)) await write(root, rel, text)
  return root
}

const mockFiles = {
  '.mocks/waitlist.list/healthy.json': '[{"id":"a"}]',
  '.mocks/waitlist.list/healthy.meta.json':
    '{"state":"healthy","default":true}',
}

const ids = async (root: string) =>
  (await planValidation(root)).map((p) => `${p.check.id}:${p.target.label}`)

describe('validate and mocks', () => {
  test('an unflagged stub fails validate', async () => {
    const root = await project({
      ...mockFiles,
      'apps/web/src/screen.tsx':
        "export const S = () => usePikkuQueryStub('waitlist:list')\n",
    })
    try {
      assert.ok((await ids(root)).includes('mocks:.'))
      const findings = await runMocksChecks(root)
      const errors = findings.filter((f) => f.severity === 'error')
      assert.deepStrictEqual(
        errors.map((f) => f.id),
        ['mocks-no-flag']
      )
      assert.ok(errors[0]!.message.includes('apps/web/src/screen.tsx:1'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('a flagged stub with a declared flag passes', async () => {
    const root = await project({
      ...mockFiles,
      '.pikku/scopes/pikku-flags-meta.gen.json': '{"waitlist":{}}',
      'apps/web/src/screen.tsx':
        "export const S = () => usePikkuQueryStub('waitlist:list', { featureFlag: 'waitlist' })\n",
    })
    try {
      const findings = await runMocksChecks(root)
      assert.deepStrictEqual(
        findings.filter((f) => f.severity === 'error'),
        []
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('a plain call to a missing function fails validate', async () => {
    const root = await project({
      '.mocks/x.y/healthy.json': '{}',
      'apps/web/src/screen.tsx':
        "export const S = () => usePikkuQuery('nothing:here')\n",
    })
    try {
      const errors = (await runMocksChecks(root)).filter(
        (f) => f.severity === 'error'
      )
      assert.deepStrictEqual(
        errors.map((f) => f.id),
        ['mocks-no-function']
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('a project with no mocks and no stub calls is not checked and sees no change', async () => {
    const root = await project({
      'apps/web/src/screen.tsx':
        "export const S = () => usePikkuQuery('nothing:here')\n",
    })
    try {
      assert.strictEqual(usesMocks(root), false)
      assert.ok(!(await ids(root)).some((id) => id.startsWith('mocks:')))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('a project that was not built gets one warning, not a crash', async () => {
    const root = await project(mockFiles)
    try {
      await rm(join(root, '.pikku'), { recursive: true, force: true })
      const findings = await runMocksChecks(root)
      assert.deepStrictEqual(
        findings.map((f) => [f.id, f.severity]),
        [['mocks-not-built', 'warn']]
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
