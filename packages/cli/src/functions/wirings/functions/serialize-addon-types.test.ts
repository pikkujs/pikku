import { test, describe } from 'node:test'
import * as assert from 'assert'
import { join } from 'path'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import {
  serializeAddonInstallTypes,
  serializeAddonTypes,
} from './serialize-addon-types.js'
import { leafEntries } from './pikku-command-leaf-indexes.js'
import { getPikkuCLIConfig } from '../../../utils/pikku-cli-config.js'
import { CLILogger } from '../../../services/cli-logger.service.js'

/**
 * An addon and the application that installs it are opposite ends of one
 * concept, but they cannot share a generated tree. A runtime template maps
 * `#pikku/*` onto a sibling package's `.pikku` through tsconfig `paths`, and
 * `paths` are global to a tsx process rather than scoped to the package that
 * declared them — so a linked addon's own `#pikku/<leaf>` resolves against the
 * *application's* leaf.
 *
 * Node never does this: `#pikku/*` is a package-private subpath import and
 * resolves against the addon's own `package.json`. The divergence is tsx's, and
 * the addon is what breaks — loudly on `#pikku/addon`, whose two halves export
 * different names, and silently everywhere else, where the addon's functions
 * would be typed against the host application's services.
 *
 * Rooting an addon's whole tree one level down is what separates them: an
 * application generates a flat `.pikku/<leaf>`, so nothing matches at
 * `#pikku/addon/<leaf>` and the resolver falls back to Node.
 */
describe('an addon authors against a tree an application cannot shadow', () => {
  const resolve = async (addon: boolean) => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-addon-leaf-'))
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: '@scope/fixture-addon', type: 'module' })
    )
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { module: 'nodenext' } })
    )
    writeFileSync(
      join(dir, 'pikku.config.json'),
      JSON.stringify({
        tsconfig: './tsconfig.json',
        srcDirectories: ['src'],
        outDir: '.pikku',
        ...(addon ? { addon: { displayName: 'X' } } : {}),
      })
    )
    try {
      return await getPikkuCLIConfig(
        new CLILogger({ logLogo: false, silent: true }),
        join(dir, 'pikku.config.json'),
        []
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  test('an addon roots its output under the addon leaf', async () => {
    const config = await resolve(true)

    assert.ok(
      config.outDir.endsWith(join('.pikku', 'addon')),
      `expected an addon to generate under .pikku/addon, got ${config.outDir}`
    )
  })

  test('an application keeps its leaves flat', async () => {
    const config = await resolve(false)

    assert.ok(
      config.outDir.endsWith('.pikku'),
      `expected an application to generate flat, got ${config.outDir}`
    )
    assert.ok(!config.outDir.includes(join('.pikku', 'addon')))
  })

  test('an addon function leaf lands where an application has no candidate', async () => {
    const app = await resolve(false)
    const addon = await resolve(true)

    // `#pikku/addon/function` against the application's `#pikku/*` pattern
    // would be `.pikku/addon/function` — a path an application never writes,
    // which is exactly why the resolver gives up on `paths` and asks Node.
    assert.ok(addon.functionTypesFile.includes(join('.pikku', 'addon')))
    assert.ok(!app.functionTypesFile.includes(join('.pikku', 'addon')))
  })

  test('the setup leaf carries both flavours, so neither needs its own leaf', () => {
    const setup = leafEntries.find(([leaf]) => leaf === 'setup')

    assert.deepEqual(setup?.[1], ['setupTypesFile', 'addonSetupTypesFile'])
    assert.ok(
      !leafEntries.some(([leaf]) => leaf === 'addon/setup'),
      'the authoring surface joins the setup leaf rather than sitting beside it'
    )
  })
})

/**
 * The install half is reached over rpc but is not an rpc concern, so it has a
 * core subpath of its own.
 */
describe('installing an addon reaches core through its own subpath', () => {
  test('the install surface imports from @pikku/core/addon', () => {
    const content = serializeAddonInstallTypes()

    assert.match(
      content,
      /export \{ wireAddon, wireRemoteAddon \} from '@pikku\/core\/addon'/
    )
    assert.ok(!content.includes('@pikku/core/rpc'))
  })

  test('the authoring surface exports none of the install names', () => {
    const content = serializeAddonTypes(
      "import type { SingletonServices } from '../../types/application-types.js'",
      'SingletonServices',
      "import type { Config } from '../../types/application-types.js'",
      "import type { RequiredSingletonServices } from '../pikku-services.gen.js'",
      "import { TypedSecretService } from '../secrets/pikku-secrets.gen.js'",
      "import { TypedVariablesService } from '../variables/pikku-variables.gen.js'"
    )

    assert.ok(content.includes('pikkuAddonConfig'))
    assert.ok(content.includes('pikkuAddonServices'))
    assert.ok(!content.includes('wireAddon'))
    assert.ok(!content.includes('wireRemoteAddon'))
  })
})
