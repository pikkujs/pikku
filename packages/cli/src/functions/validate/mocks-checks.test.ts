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
      assert.strictEqual(await usesMocks(root), false)
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

  describe('calls into wired addons', () => {
    const addonsMeta = JSON.stringify({
      studio: {
        package: '@scope/addon-studio',
        functions: { listSetups: {}, getSetup: { expose: true } },
      },
      far: { package: '@scope/addon-far', remote: true },
    })

    const errorsFor = async (rpc: string, meta: string | null) => {
      const root = await project({
        '.mocks/x.y/healthy.json': '{}',
        ...(meta === null
          ? {}
          : { '.pikku/addon/pikku-addons-meta.gen.json': meta }),
        'apps/web/src/screen.tsx': `export const S = () => usePikkuQuery('${rpc}')\n`,
      })
      try {
        return (await runMocksChecks(root))
          .filter((f) => f.severity === 'error')
          .map((f) => f.id)
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    }

    test('a plain call to a listed addon function passes', async () => {
      assert.deepStrictEqual(
        await errorsFor('studio:listSetups', addonsMeta),
        []
      )
    })

    test('an unknown function in a wired namespace still fails', async () => {
      assert.deepStrictEqual(await errorsFor('studio:nothing', addonsMeta), [
        'mocks-no-function',
      ])
    })

    test('any function under a remote namespace passes', async () => {
      assert.deepStrictEqual(await errorsFor('far:anything', addonsMeta), [])
    })

    test('without the addons meta file an addon call fails as before', async () => {
      assert.deepStrictEqual(await errorsFor('studio:listSetups', null), [
        'mocks-no-function',
      ])
    })
  })

  describe('mocks an addon ships', () => {
    const withAddon = (extra: Record<string, string>) =>
      project({
        '.mocks/x.y/healthy.json': '{}',
        '.pikku/addon/pikku-addons-meta.gen.json': JSON.stringify({
          studio: { package: '@scope/addon-studio', functions: {} },
        }),
        '.pikku/scopes/pikku-flags-meta.gen.json': '{"setups":{}}',
        'node_modules/@scope/addon-studio/package.json': '{}',
        'apps/web/src/screen.tsx':
          "export const S = () => usePikkuQueryStub('studio:listSetups', { featureFlag: 'setups' })\n",
        ...extra,
      })

    test('a stub backed only by an addon mock passes', async () => {
      const root = await withAddon({
        'node_modules/@scope/addon-studio/.mocks/listSetups/gym.json': '[]',
        'node_modules/@scope/addon-studio/.mocks/listSetups/gym.meta.json':
          '{"default":true}',
      })
      try {
        assert.deepStrictEqual(
          (await runMocksChecks(root)).filter((f) => f.severity === 'error'),
          []
        )
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    })

    test('without the addon mock the stub has no mock', async () => {
      const root = await withAddon({})
      try {
        assert.deepStrictEqual(
          (await runMocksChecks(root))
            .filter((f) => f.severity === 'error')
            .map((f) => f.id),
          ['mocks-no-mock']
        )
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    })
  })
})
