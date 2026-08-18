import assert from 'node:assert/strict'
import { test } from 'node:test'

import { pikkuState } from '@pikku/core/state'
import { getAddonInstalledPackage } from './get-installed-package.function.js'

/**
 * An addon roots its whole generated tree at `.pikku/addon`, while
 * `readPackageFile` starts from the package's `.pikku` — it also serves
 * ordinary packages, so it cannot add the segment itself. Reading the flat
 * path finds nothing, every requirement comes back empty, and the console's
 * setup tab silently disappears rather than failing.
 */
test('the installed package is read from the addon tree, not the flat one', async () => {
  const packageName = '@pikku/addon-under-test'
  pikkuState(packageName, 'package', 'factories', {} as never)

  const asked: string[] = []
  const metaService = {
    readPackageFile: async (_name: string, relativePath: string) => {
      asked.push(relativePath)
      return relativePath === 'addon/secrets/pikku-secrets-meta.gen.json'
        ? JSON.stringify({ API_KEY: { description: 'a key' } })
        : null
    },
    readPackageDir: async (_name: string, relativePath: string) => {
      asked.push(relativePath)
      return []
    },
  }

  const result = (await getAddonInstalledPackage.func(
    { metaService } as never,
    { packageName },
    {} as never
  )) as { secrets: Record<string, unknown> } | null

  assert.deepEqual(result?.secrets, { API_KEY: { description: 'a key' } })
  assert.ok(asked.length > 0, 'the addon tree is read')
  for (const path of asked) {
    assert.ok(
      path.startsWith('addon/'),
      `${path} is read from the application's flat tree, not the addon's`
    )
  }
})
