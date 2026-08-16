import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { checkAddonReadiness, readWiringOverrides } from './addon-readiness.js'

const PACKAGE = '@acme/addon-widget'

const writeAddon = async (
  root: string,
  {
    secrets,
    variables,
    schemas,
    under = '.pikku',
  }: {
    secrets?: Record<string, unknown>
    variables?: Record<string, unknown>
    schemas?: Record<string, unknown>
    under?: string
  }
) => {
  const pikkuDir = join(root, 'node_modules', PACKAGE, under)
  if (secrets) {
    await mkdir(join(pikkuDir, 'secrets'), { recursive: true })
    await writeFile(
      join(pikkuDir, 'secrets', 'pikku-secrets-meta.gen.json'),
      JSON.stringify(secrets)
    )
  }
  if (variables) {
    await mkdir(join(pikkuDir, 'variables'), { recursive: true })
    await writeFile(
      join(pikkuDir, 'variables', 'pikku-variables-meta.gen.json'),
      JSON.stringify(variables)
    )
  }
  await mkdir(join(pikkuDir, 'schemas', 'schemas'), { recursive: true })
  for (const [name, schema] of Object.entries(schemas ?? {})) {
    await writeFile(
      join(pikkuDir, 'schemas', 'schemas', `${name}.schema.json`),
      JSON.stringify(schema)
    )
  }
}

const probes = (present: string[]) => ({
  secrets: { hasSecret: async (key: string) => present.includes(key) },
  variables: { has: (name: string) => present.includes(name) },
})

const withRoot = async (fn: (root: string) => Promise<void>) => {
  const root = await mkdtemp(join(tmpdir(), 'addon-readiness-'))
  try {
    await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('reports the secrets and variables the host cannot resolve', async () => {
  await withRoot(async (root) => {
    await writeAddon(root, {
      secrets: { api_key: { secretId: 'WIDGET_API_KEY' } },
      variables: { base_url: { variableId: 'WIDGET_BASE_URL' } },
    })

    const readiness = await checkAddonReadiness(probes([]), root, PACKAGE)
    assert.deepEqual(readiness, {
      ready: false,
      missingSecrets: ['WIDGET_API_KEY'],
      missingVariables: ['WIDGET_BASE_URL'],
    })

    const configured = await checkAddonReadiness(
      probes(['WIDGET_API_KEY', 'WIDGET_BASE_URL']),
      root,
      PACKAGE
    )
    assert.equal(configured.ready, true)
  })
})

test('a variable whose schema has a default is not missing', async () => {
  await withRoot(async (root) => {
    await writeAddon(root, {
      variables: {
        base_url: {
          variableId: 'WIDGET_BASE_URL',
          schema: 'VariableSchema_base_url',
        },
      },
      schemas: {
        VariableSchema_base_url: {
          type: 'string',
          default: 'http://localhost',
        },
      },
    })

    const readiness = await checkAddonReadiness(probes([]), root, PACKAGE)
    assert.deepEqual(readiness.missingVariables, [])
    assert.equal(readiness.ready, true)
  })
})

test('checks the override name, not the logical one', async () => {
  await withRoot(async (root) => {
    await writeAddon(root, {
      secrets: { api_key: { secretId: 'WIDGET_API_KEY' } },
    })

    const readiness = await checkAddonReadiness(
      probes(['WIDGET_API_KEY']),
      root,
      PACKAGE,
      { secretOverrides: { WIDGET_API_KEY: 'WIDGET_PROMO_API_KEY' } }
    )
    assert.deepEqual(readiness.missingSecrets, ['WIDGET_PROMO_API_KEY'])
  })
})

test('finds meta a package ships only under dist', async () => {
  await withRoot(async (root) => {
    await writeAddon(root, {
      secrets: { api_key: { secretId: 'WIDGET_API_KEY' } },
      under: join('dist', '.pikku'),
    })

    const readiness = await checkAddonReadiness(probes([]), root, PACKAGE)
    assert.deepEqual(readiness.missingSecrets, ['WIDGET_API_KEY'])
  })
})

test('a package with no declarations is ready', async () => {
  await withRoot(async (root) => {
    await writeAddon(root, {})
    const readiness = await checkAddonReadiness(probes([]), root, PACKAGE)
    assert.equal(readiness.ready, true)
  })
})

test('reads the override names out of the instance wiring file', async () => {
  await withRoot(async (root) => {
    const wiringFile = join(root, 'widget-promo.addon.ts')
    await writeFile(
      wiringFile,
      `import { wireAddon } from '#pikku/function'

wireAddon({
  name: 'widget-promo',
  package: '${PACKAGE}',
  secretOverrides: { 'WIDGET_API_KEY': 'WIDGET_PROMO_API_KEY' },
  variableOverrides: { 'WIDGET_BASE_URL': 'WIDGET_PROMO_BASE_URL' },
})
`
    )

    assert.deepEqual(await readWiringOverrides(wiringFile), {
      secretOverrides: { WIDGET_API_KEY: 'WIDGET_PROMO_API_KEY' },
      variableOverrides: { WIDGET_BASE_URL: 'WIDGET_PROMO_BASE_URL' },
      credentialOverrides: undefined,
    })
  })
})
