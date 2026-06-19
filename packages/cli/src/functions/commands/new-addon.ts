import { existsSync } from 'fs'
import { join } from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'
import {
  createEmptyManifest,
  saveManifest,
} from '../../utils/contract-versions.js'
import ts from 'typescript'
import { pikkuSessionlessFunc } from '#pikku'
import { assignBundlePaths, selectBundledFunctions } from './addon-bundle.js'
import { checkRawSqlOwnership } from '../db/addon-table-discovery.js'
import {
  generateAddonServices,
  generateScopedDbTypes,
} from '../db/addon-assembly.js'
import { carveDbAddon } from '../db/addon-db-carve.js'
import { carveServiceTypes } from '../db/addon-service-carve.js'
import {
  parseOpenAPISpec,
  computeContractHash,
  generateAddonFromOpenAPI,
} from '@pikku/openapi-parser'

function toCamelCase(str: string): string {
  return str.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())
}

function toPascalCase(str: string): string {
  const camel = toCamelCase(str)
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}

function toScreamingSnake(str: string): string {
  return str.replace(/-/g, '_').toUpperCase()
}

const TLD_SEGMENTS = new Set([
  'com',
  'io',
  'org',
  'net',
  'co',
  'dev',
  'app',
  'us',
  'uk',
  'eu',
  'de',
  'fr',
  'nl',
  'ch',
  'ca',
  'au',
  'gov',
  'edu',
  'local',
  'cloud',
  'ai',
  'fm',
  'tv',
  'me',
  'cc',
  'info',
  'biz',
  'xyz',
  'tech',
  'space',
  'online',
  'site',
  'store',
  'ac',
  'int',
  'mil',
  'ninja',
  'guru',
])

function sanitizeAddonName(raw: string): string {
  const dotParts = raw.toLowerCase().split('.')
  const kept: string[] = []
  for (const part of dotParts) {
    const clean = part.replace(/^-|-$/g, '')
    if (TLD_SEGMENTS.has(clean)) continue
    const hyphenIdx = part.indexOf('-')
    if (hyphenIdx > 0 && TLD_SEGMENTS.has(part.slice(0, hyphenIdx))) {
      kept.push(part.slice(hyphenIdx + 1))
      continue
    }
    kept.push(part)
  }
  let name = kept
    .join('-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (name && /^[0-9]/.test(name)) name = `x${name}`
  return name || raw
}

interface AddonVars {
  name: string
  camelName: string
  pascalName: string
  screamingName: string
  displayName: string
  description: string
  category: string
}

function getAddonFiles(
  vars: AddonVars,
  flags: {
    secret: boolean
    variable: boolean
    oauth: boolean
    credential?: 'apikey' | 'bearer' | 'oauth2'
  }
): Record<string, string> {
  const {
    name,
    camelName,
    pascalName,
    screamingName,
    displayName,
    description,
    category,
  } = vars
  const files: Record<string, string> = {}

  // package.json
  files['package.json'] = JSON.stringify(
    {
      name: `@pikku/addon-${name}`,
      version: '0.0.1',
      type: 'module',
      imports: {
        '#pikku': './.pikku/pikku-types.gen.ts',
        '#pikku/*': './.pikku/*',
      },
      exports: {
        '.': {
          types: './dist/src/index.d.ts',
          import: './dist/src/index.js',
        },
        // `.pikku` is exported from source (not dist): its gen files import
        // sibling `../types/*.d.ts`, which tsc never emits into dist — so a
        // dist-rooted `.pikku` would dangle for any consumer that compiles it.
        './.pikku/*': './.pikku/*',
        './.pikku/pikku-metadata.gen.json': './.pikku/pikku-metadata.gen.json',
        './.pikku/rpc/pikku-rpc-wirings-map.internal.gen.js': {
          types: './.pikku/rpc/pikku-rpc-wirings-map.internal.gen.d.ts',
        },
      },
      files: ['dist', '.pikku', 'types'],
      scripts: {
        prepublishOnly: 'yarn build',
        prebuild: 'pikku all',
        build: 'tsc && cp -r .pikku dist/',
        pikku: 'pikku all',
      },
      peerDependencies: {
        '@pikku/core': '*',
        zod: '^4',
      },
      devDependencies: {
        '@pikku/cli': '*',
        '@pikku/core': '*',
        typescript: '^5.7.2',
        zod: '^4',
      },
    },
    null,
    2
  )

  // pikku.config.json
  files['pikku.config.json'] = JSON.stringify(
    {
      $schema:
        'https://raw.githubusercontent.com/pikkujs/pikku/refs/heads/main/packages/cli/cli.schema.json',
      tsconfig: './tsconfig.json',
      srcDirectories: ['src', 'types'],
      outDir: './.pikku',
      addon: true,
      node: {
        displayName,
        description,
        categories: [category],
        icon: `./${name}.svg`,
      },
    },
    null,
    2
  )

  // tsconfig.json
  files['tsconfig.json'] = JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2021',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        rootDir: '.',
        outDir: './dist',
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        paths: {
          '#pikku': ['./.pikku/pikku-types.gen.ts'],
        },
      },
      include: ['src/**/*', 'types/**/*', '.pikku/**/*.ts'],
      exclude: ['node_modules', 'dist', '.pikku/**/*.d.ts'],
    },
    null,
    2
  )

  // README.md
  files['README.md'] = `# @pikku/addon-${name}

${description}

## Setup

1. Add icon SVG at \`${name}.svg\`
2. Update secret schema with required fields
3. Implement API service methods
4. Create function files for each operation
5. Export functions in \`src/index.ts\`
6. Build: \`yarn install && yarn pikku && yarn build\`
`

  // src/index.ts
  files['src/index.ts'] = `// ${displayName} functions
// export { ${camelName}Operation } from './functions/operation.function.js'
`

  // src/services.ts
  if (flags.credential && flags.credential !== 'oauth2') {
    // Per-user credential: use createWireServices with wire.getCredential()
    const credField = flags.credential === 'bearer' ? 'token' : 'apiKey'
    files['src/services.ts'] =
      `import { ${pascalName}Service } from './${name}-api.service.js'
import { pikkuAddonWireServices } from '#pikku'

export const createWireServices = pikkuAddonWireServices(
  async ({ variables }, wire) => {
    const cred = await wire.getCredential<{ ${credField}: string }>('${camelName}')
    if (!cred?.${credField}) {
      throw new Error('Missing ${camelName} credential')
    }
    const ${camelName} = new ${pascalName}Service(cred, variables)

    return { ${camelName} }
  }
)
`
  } else if (flags.oauth || flags.credential === 'oauth2') {
    files['src/services.ts'] =
      `import { ${pascalName}Service } from './${name}-api.service.js'
import { pikkuAddonServices } from '#pikku'

export const createSingletonServices = pikkuAddonServices(async (
  config,
  { secrets, variables }
) => {
  const ${camelName} = new ${pascalName}Service(secrets, variables)

  return { ${camelName} }
})
`
  } else if (flags.secret) {
    files['src/services.ts'] =
      `import { ${pascalName}Service } from './${name}-api.service.js'
import type { ${pascalName}Secrets } from './${name}.secret.js'
import { pikkuAddonServices } from '#pikku'

export const createSingletonServices = pikkuAddonServices(async (
  config,
  { secrets, variables }
) => {
  const creds = await secrets.getSecret<${pascalName}Secrets>('${screamingName}_CREDENTIALS')
  const ${camelName} = new ${pascalName}Service(creds, variables)

  return { ${camelName} }
})
`
  } else {
    files['src/services.ts'] =
      `import { ${pascalName}Service } from './${name}-api.service.js'
import { pikkuAddonServices } from '#pikku'

export const createSingletonServices = pikkuAddonServices(async (
  config,
  { variables }
) => {
  const ${camelName} = new ${pascalName}Service(variables)

  return { ${camelName} }
})
`
  }

  // src/{name}-api.service.ts
  if (flags.credential && flags.credential !== 'oauth2') {
    const credField = flags.credential === 'bearer' ? 'token' : 'apiKey'
    const credType = `{ ${credField}: string }`
    const authHeader =
      flags.credential === 'bearer'
        ? `\`Bearer \${this.creds.token}\``
        : `this.creds.apiKey`
    const authLine =
      flags.credential === 'bearer'
        ? `'Authorization': ${authHeader},`
        : `'Authorization': \`Bearer \${this.creds.apiKey}\`,`
    files[`src/${name}-api.service.ts`] =
      `const BASE_URL = 'https://api.example.com/v1'

export interface RequestOptions {
  body?: unknown
  qs?: Record<string, string | number | boolean | undefined>
}

export class ${pascalName}Service {
  constructor(private creds: ${credType}) {}

  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    endpoint: string,
    options?: RequestOptions
  ): Promise<T> {
    const url = new URL(endpoint, BASE_URL)

    if (options?.qs) {
      for (const [key, value] of Object.entries(options.qs)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value))
        }
      }
    }

    const response = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        ${authLine}
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(\`${displayName} API error (\${response.status}): \${errorText}\`)
    }

    return response.json() as Promise<T>
  }
}
`
  } else if (flags.oauth) {
    files[`src/${name}-api.service.ts`] =
      `import { OAuth2Client } from '@pikku/core/oauth2'
import type { TypedSecretService } from '#pikku/secrets/pikku-secrets.gen.js'

const BASE_URL = 'https://api.example.com/v1'

export const ${screamingName}_OAUTH2_CONFIG = {
  tokenSecretId: '${screamingName}_TOKENS',
  authorizationUrl: 'https://example.com/oauth2/authorize',
  tokenUrl: 'https://example.com/oauth2/token',
  scopes: ['read', 'write'],
}

export interface RequestOptions {
  body?: unknown
  qs?: Record<string, string | number | boolean | undefined>
}

export class ${pascalName}Service {
  private oauth: OAuth2Client

  constructor(secrets: TypedSecretService) {
    this.oauth = new OAuth2Client(
      ${screamingName}_OAUTH2_CONFIG,
      '${screamingName}_APP_CREDENTIALS',
      secrets
    )
  }

  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    endpoint: string,
    options?: RequestOptions
  ): Promise<T> {
    const url = new URL(\`\${BASE_URL}\${endpoint}\`)

    if (options?.qs) {
      for (const [key, value] of Object.entries(options.qs)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value))
        }
      }
    }

    const response = await this.oauth.request(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(\`${displayName} API error (\${response.status}): \${errorText}\`)
    }

    const text = await response.text()
    if (!text) {
      return {} as T
    }
    return JSON.parse(text) as T
  }
}
`
  } else if (flags.secret) {
    files[`src/${name}-api.service.ts`] =
      `import type { ${pascalName}Secrets } from './${name}.secret.js'

const BASE_URL = 'https://api.example.com/v1'

export interface RequestOptions {
  body?: unknown
  qs?: Record<string, string | number | boolean | undefined>
}

export class ${pascalName}Service {
  constructor(private creds: ${pascalName}Secrets) {}

  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    endpoint: string,
    options?: RequestOptions
  ): Promise<T> {
    const url = new URL(endpoint, BASE_URL)

    if (options?.qs) {
      for (const [key, value] of Object.entries(options.qs)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value))
        }
      }
    }

    const response = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${this.creds.apiKey}\`,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(\`${displayName} API error (\${response.status}): \${errorText}\`)
    }

    return response.json() as Promise<T>
  }
}
`
  } else {
    files[`src/${name}-api.service.ts`] =
      `const BASE_URL = 'https://api.example.com/v1'

export interface RequestOptions {
  body?: unknown
  qs?: Record<string, string | number | boolean | undefined>
}

export class ${pascalName}Service {
  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    endpoint: string,
    options?: RequestOptions
  ): Promise<T> {
    const url = new URL(endpoint, BASE_URL)

    if (options?.qs) {
      for (const [key, value] of Object.entries(options.qs)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value))
        }
      }
    }

    const response = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(\`${displayName} API error (\${response.status}): \${errorText}\`)
    }

    return response.json() as Promise<T>
  }
}
`
  }

  // src/{name}.types.ts
  files[`src/${name}.types.ts`] = `import { z } from 'zod'

// Define Zod schemas for API types

export const ${pascalName}ResourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  // Add fields based on API response
})

export type ${pascalName}Resource = z.infer<typeof ${pascalName}ResourceSchema>
`

  // types/application-types.d.ts
  files['types/application-types.d.ts'] = `import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'
import type { ${pascalName}Service } from '../src/${name}-api.service.js'

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  ${camelName}: ${pascalName}Service
}

export interface Services extends CoreServices<SingletonServices> {}
`

  // Conditional: credential / secret file
  if (flags.credential === 'apikey') {
    files[`src/${name}.credential.ts`] = `import { z } from 'zod'
import { wireCredential } from '@pikku/core/credential'

export const ${camelName}CredentialSchema = z.object({
  apiKey: z.string().describe('${displayName} API key'),
})

wireCredential({
  name: '${camelName}',
  displayName: '${displayName}',
  description: '${description}',
  type: 'wire',
  schema: ${camelName}CredentialSchema,
})
`
  } else if (flags.credential === 'bearer') {
    files[`src/${name}.credential.ts`] = `import { z } from 'zod'
import { wireCredential } from '@pikku/core/credential'

export const ${camelName}CredentialSchema = z.object({
  token: z.string().describe('${displayName} bearer token'),
})

wireCredential({
  name: '${camelName}',
  displayName: '${displayName}',
  description: '${description}',
  type: 'wire',
  schema: ${camelName}CredentialSchema,
})
`
  } else if (flags.oauth || flags.credential === 'oauth2') {
    files[`src/${name}.credential.ts`] = `import { z } from 'zod'
import { wireCredential } from '@pikku/core/credential'
import { wireSecret } from '@pikku/core/secret'

export const ${camelName}TokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
})

wireCredential({
  name: '${camelName}',
  displayName: '${displayName}',
  description: '${description}',
  type: 'wire',
  schema: ${camelName}TokenSchema,
  oauth2: {
    appCredentialSecretId: '${screamingName}_OAUTH_APP',
    tokenSecretId: '${screamingName}_OAUTH_TOKENS',
    authorizationUrl: 'https://example.com/oauth2/authorize',
    tokenUrl: 'https://example.com/oauth2/token',
    scopes: ['read', 'write'],
  },
})

wireSecret({
  name: '${camelName}OAuthApp',
  displayName: '${displayName} OAuth App',
  description: 'OAuth2 app credentials for ${displayName}',
  secretId: '${screamingName}_OAUTH_APP',
})
`
  } else if (flags.secret) {
    files[`src/${name}.secret.ts`] = `import { z } from 'zod'
import { wireSecret } from '@pikku/core/secret'

export const ${camelName}SecretsSchema = z.object({
  apiKey: z.string().describe('${displayName} API key'),
  // Add other secret fields as needed
})

export type ${pascalName}Secrets = z.infer<typeof ${camelName}SecretsSchema>

wireSecret({
  name: '${camelName}',
  displayName: '${displayName} API',
  description: '${description}',
  secretId: '${screamingName}_CREDENTIALS',
  schema: ${camelName}SecretsSchema,
})
`
  }

  // Conditional: variable file
  if (flags.variable) {
    files[`src/${name}.variable.ts`] = `import { z } from 'zod'
import { wireVariable } from '@pikku/core/variable'

export const ${camelName}VariableSchema = z.string().optional().describe('TODO: describe this variable')

wireVariable({
  name: '${camelName}_variable',
  displayName: '${displayName} Variable',
  description: 'TODO: describe this variable',
  variableId: '${screamingName}_VARIABLE',
  schema: ${camelName}VariableSchema,
})
`
  }

  return files
}

function getTestFiles(vars: AddonVars): Record<string, string> {
  const { name, camelName, pascalName, screamingName } = vars
  const files: Record<string, string> = {}

  // test/package.json
  files['package.json'] = JSON.stringify(
    {
      name: `@pikku/test-${name}`,
      private: true,
      type: 'module',
      imports: {
        '#pikku': './.pikku/pikku-types.gen.ts',
        '#pikku/*': './.pikku/*',
      },
      scripts: {
        pretest: 'pikku all',
        test: 'node --import tsx --test src/**/*.test.ts',
      },
      dependencies: {
        '@pikku/core': '*',
        [`@pikku/addon-${name}`]: 'file:..',
      },
      devDependencies: {
        '@pikku/cli': '*',
        '@types/node': '^24',
        tsx: '^4',
        typescript: '^5.9',
        zod: '^4',
      },
    },
    null,
    2
  )

  // test/pikku.config.json
  files['pikku.config.json'] = JSON.stringify(
    {
      $schema:
        'https://raw.githubusercontent.com/pikkujs/pikku/refs/heads/main/packages/cli/cli.schema.json',
      srcDirectories: ['./src', './types'],
      outDir: './.pikku',
      tsconfig: './tsconfig.json',
    },
    null,
    2
  )

  // test/tsconfig.json
  files['tsconfig.json'] = JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2021',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        declaration: true,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        resolveJsonModule: true,
        types: ['node'],
        paths: {
          '#pikku': ['./.pikku/pikku-types.gen.ts'],
        },
      },
      include: ['src/*', '.pikku/**/*', 'types/**/*'],
      exclude: ['node_modules', '.pikku/**/*.d.ts'],
    },
    null,
    2
  )

  // test/src/addons.ts
  files['src/addons.ts'] = `import { wireAddon } from '#pikku'

wireAddon({ name: '${name}', package: '@pikku/addon-${name}' })
`

  // test/src/services.ts
  files['src/services.ts'] = `import {
  ConsoleLogger,
  LocalVariablesService,
  LocalSecretService,
} from '@pikku/core/services'
import { pikkuServices } from '#pikku'

import '../.pikku/pikku-bootstrap.gen.js'

export const createSingletonServices = pikkuServices(async (_config, existingServices) => {
  const variables = existingServices?.variables ?? new LocalVariablesService(process.env)
  const secrets = existingServices?.secrets ?? new LocalSecretService(variables)

  return {
    logger: existingServices?.logger ?? new ConsoleLogger(),
    variables,
    secrets,
  }
})
`

  // test/src/{name}-tests.function.ts
  files[`src/${name}-tests.function.ts`] =
    `import assert from 'node:assert/strict'
import { pikkuSessionlessFunc } from '#pikku'

export type Test${pascalName}Input = {}
export type Test${pascalName}Output = { passed: number; failed: string[] }

export const test${pascalName} = pikkuSessionlessFunc<Test${pascalName}Input, Test${pascalName}Output>({
  func: async (_services, _data, { rpc }) => {
    let passed = 0
    const failed: string[] = []

    const run = async (name: string, fn: () => Promise<void>) => {
      try {
        await fn()
        passed++
      } catch (e: any) {
        failed.push(\`\${name}: \${e.message}\`)
      }
    }

    // Add test cases here:
    // await run('test name', async () => {
    //   const result = await rpc.invoke('${camelName}:functionName', { ... })
    //   assert.equal(result.someField, expectedValue)
    // })

    return { passed, failed }
  }
})
`

  // test/src/{name}.test.ts
  files[`src/${name}.test.ts`] = `import '../.pikku/pikku-bootstrap.gen.js'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stopSingletonServices } from '@pikku/core'
import { rpcService } from '@pikku/core/rpc'
import { LocalSecretService } from '@pikku/core/services'
import { createSingletonServices } from './services.js'

test('${name} addon', async () => {
  const secrets = new LocalSecretService()
  // Set up secrets for the service
  // await secrets.setSecret('${screamingName}_CREDENTIALS', { ... })

  const singletonServices = await createSingletonServices({}, { secrets })
  const rpc = rpcService.getContextRPCService(singletonServices as any, {})

  try {
    const { passed, failed } = await rpc.invoke('test${pascalName}', {})

    console.log(\`\\n  \${passed} passed\`)
    if (failed.length > 0) {
      console.log(\`  \${failed.length} failed:\`)
      for (const f of failed) console.log(\`    \\u2717 \${f}\`)
    }

    assert.equal(failed.length, 0, \`Failed tests:\\n\${failed.join('\\n')}\`)
  } finally {
    await stopSingletonServices()
  }
})
`

  // test/types/application-types.d.ts
  files['types/application-types.d.ts'] = `import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'

export interface Config extends CoreConfig {}
export interface UserSession extends CoreUserSession {}
export interface SingletonServices extends CoreSingletonServices<Config> {}
export interface Services extends CoreServices<SingletonServices> {}
`

  return files
}

async function writeFiles(
  baseDir: string,
  files: Record<string, string>
): Promise<string[]> {
  const written: string[] = []
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(baseDir, relativePath)
    await mkdir(join(fullPath, '..'), { recursive: true })
    await writeFile(fullPath, content, 'utf-8')
    written.push(fullPath)
  }
  return written
}

/** Base services the host always provides; never re-declared by the addon. */
const BASE_SERVICES = new Set([
  'config',
  'logger',
  'variables',
  'secrets',
  'schema',
])

/**
 * Carve mode replaces the API-client scaffold (`{name}-api.service.ts`,
 * the service it constructs, the `{name}.types.ts` Zod stub) with a
 * `pikkuAddonServices` factory derived from what the bundled functions
 * actually destructure. Base services are auto-provided; any non-base service
 * (e.g. `kysely`) becomes a required parent service. Returns the files to
 * overwrite and the scaffold files to drop.
 */
function carveServiceFiles(
  vars: AddonVars,
  requiredServices: string[]
): { write: Record<string, string>; remove: string[] } {
  const { name } = vars
  return {
    write: {
      'src/services.ts': generateAddonServices(requiredServices),
      'src/index.ts': `// Functions carved from the source project live in src/functions/.\n`,
    },
    remove: [`src/${name}-api.service.ts`, `src/${name}.types.ts`],
  }
}

/**
 * The addon's application-types. kysely (if used) is declared scoped to the
 * addon's owned tables (`AddonDB`); each carved user service is declared with
 * the same type it has in the source — so the bundled functions and the
 * `pikkuAddonServices` factory type-check against exactly the carved surface.
 */
function buildApplicationTypes(opts: {
  hasKysely: boolean
  imports: string[]
  members: string[]
}): string {
  const imports = [
    `import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'`,
  ]
  const members: string[] = []
  if (opts.hasKysely) {
    imports.push(`import type { Kysely } from 'kysely'`)
    imports.push(`import type { AddonDB } from './addon-db.gen.js'`)
    members.push('  kysely: Kysely<AddonDB>')
  }
  imports.push(...opts.imports)
  members.push(...opts.members)

  const body = members.length > 0 ? `{\n${members.join('\n')}\n}` : '{}'
  return `${imports.join('\n')}

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> ${body}

export interface Services extends CoreServices<SingletonServices> {}
`
}

export const pikkuNewAddon = pikkuSessionlessFunc<
  {
    name: string
    displayName?: string
    description?: string
    category?: string
    dir?: string
    secret?: boolean
    variable?: boolean
    oauth?: boolean
    credential?: string
    test?: boolean
    openapi?: string
    mcp?: boolean
    camelCase?: boolean
    carve?: boolean
  },
  void
>({
  func: async (
    { logger, config, getInspectorState },
    {
      name,
      displayName,
      description,
      category = 'General',
      dir,
      secret = false,
      variable = false,
      oauth = false,
      credential,
      test = true,
      openapi,
      mcp = false,
      camelCase = false,
      carve = false,
    }
  ) => {
    name = sanitizeAddonName(name)

    if (!/^[a-z][a-z0-9_-]*$/.test(name)) {
      logger.error(
        `Invalid addon name "${name}": must start with a lowercase letter and contain only lowercase alphanumerics, hyphens, and underscores`
      )
      process.exit(1)
    }

    const pascalName = toPascalCase(name)
    const resolvedDisplayName = displayName || pascalName
    const resolvedDescription =
      description || `${resolvedDisplayName} integration for Pikku`

    // Resolve target directory
    const baseDir = dir || config.scaffold?.addonDir || process.cwd()
    const addonDir = join(baseDir, name)

    if (existsSync(addonDir)) {
      logger.error(`Directory already exists: ${addonDir}`)
      process.exit(1)
    }

    const vars: AddonVars = {
      name,
      camelName: toCamelCase(name),
      pascalName,
      screamingName: toScreamingSnake(name),
      displayName: resolvedDisplayName,
      description: resolvedDescription,
      category,
    }

    // Validate credential type if provided
    const credentialType = credential as
      | 'apikey'
      | 'bearer'
      | 'oauth2'
      | undefined
    if (
      credentialType &&
      !['apikey', 'bearer', 'oauth2'].includes(credentialType)
    ) {
      logger.error(
        `Invalid credential type "${credential}": must be one of apikey, bearer, oauth2`
      )
      process.exit(1)
    }

    // oauth implies secret (unless credential flag is used); credential oauth2 implies oauth
    const effectiveOAuth = oauth || credentialType === 'oauth2'
    const addonFiles = getAddonFiles(vars, {
      secret: (secret || effectiveOAuth) && !credentialType,
      variable,
      oauth: effectiveOAuth,
      credential: credentialType,
    })

    // If openapi spec provided, generate typed files and merge over scaffold
    if (openapi) {
      const spec = await parseOpenAPISpec(openapi)
      const openapiFiles = generateAddonFromOpenAPI(spec, vars, {
        oauth: effectiveOAuth,
        secret: (secret || effectiveOAuth) && !credentialType,
        credential: credentialType,
        mcp,
        camelCase,
      })
      Object.assign(addonFiles, openapiFiles)

      // Inject openapi metadata into pikku.config.json
      const config = JSON.parse(addonFiles['pikku.config.json'])
      if (typeof config.addon === 'boolean' || !config.addon) {
        config.addon = {}
      }
      config.addon.openapi = {
        version: spec.info.version,
        hash: computeContractHash(spec),
        ...(camelCase ? { camelCase: true } : {}),
      }
      addonFiles['pikku.config.json'] = JSON.stringify(config, null, 2)
    }

    // Carve: bundle the project's functions into the addon. Which functions are
    // in scope is pikku's call, not ours — `getInspectorState()` returns the
    // state already narrowed by the global `--filter`/`--tags`/`--names` flags,
    // so we just bundle whatever's left.
    if (carve) {
      const state = await getInspectorState()
      const meta = state.functions.meta ?? {}
      const { matched, skipped } = selectBundledFunctions(meta)
      if (matched.length === 0) {
        logger.error(
          'No functions to carve. Narrow the project with --filter/--tags/--names so there is something to bundle.'
        )
        process.exit(1)
      }

      const bundled = assignBundlePaths(matched)
      for (const { destPath, sourceFile } of bundled) {
        try {
          addonFiles[destPath] = await readFile(sourceFile, 'utf-8')
        } catch {
          logger.error(`Could not read bundled function source: ${sourceFile}`)
          process.exit(1)
        }
      }

      // Gate: a bundled function that builds queries with raw SQL has table
      // ownership the type oracle can't determine — refuse rather than ship an
      // addon silently missing its tables. Report against the original source.
      const rawSqlErrors = checkRawSqlOwnership(
        bundled.map(({ sourceFile, destPath }) =>
          ts.createSourceFile(
            sourceFile,
            addonFiles[destPath]!,
            ts.ScriptTarget.Latest,
            /* setParentNodes */ true
          )
        )
      )
      if (rawSqlErrors.length > 0) {
        for (const e of rawSqlErrors) logger.error(e)
        process.exit(1)
      }

      // Derive the addon's service contract from what the bundled functions
      // actually use, and replace the API-client scaffold with it.
      const requiredServices = new Set<string>()
      for (const fn of matched) {
        for (const s of meta[fn.id]?.services?.services ?? []) {
          requiredServices.add(s)
        }
      }
      const requiredServicesList = [...requiredServices]
      const { write, remove } = carveServiceFiles(vars, requiredServicesList)
      for (const path of remove) delete addonFiles[path]
      Object.assign(addonFiles, write)

      // Shake the user-defined (non-base, non-kysely) services the bundled
      // functions use: copy each one's type into the addon and declare it on
      // SingletonServices, so the factory destructure type-checks.
      const svc = state.program
        ? carveServiceTypes(state.program, requiredServicesList)
        : {
            members: [],
            imports: [],
            files: {},
            unsupported: requiredServicesList.filter(
              (s) => !BASE_SERVICES.has(s) && s !== 'kysely'
            ),
          }
      Object.assign(addonFiles, svc.files)
      // Gate (mirrors the raw-SQL gate): a service whose type can't be carved
      // from the source would leave the factory destructuring an undeclared
      // service — a non-compiling addon. Refuse rather than ship it broken.
      if (svc.unsupported.length > 0) {
        logger.error(
          `Carved functions use service(s) the addon can't type from the source: ${svc.unsupported.join(', ')}. ` +
            `Their types resolve through an external package or a sibling-imported file, which the carve can't copy cleanly. ` +
            `Declare them on the addon's SingletonServices manually, or exclude the functions using them.`
        )
        process.exit(1)
      }

      // DB shake: if the bundled functions use kysely, scope the addon to the
      // tables they actually own (compile-oracle) and ship the owned-table SQL +
      // scoped DB type. kysely is declared as a required parent service.
      const hasKysely = requiredServices.has('kysely')
      if (hasKysely) {
        if (!state.program) {
          logger.error(
            'Cannot scope the DB addon: the inspector produced no TypeScript program.'
          )
          process.exit(1)
        }
        const carved = carveDbAddon({
          addonName: name,
          engine: 'sqlite', // TODO: derive the engine from the project config
          program: state.program,
          functionFiles: matched.map((f) => f.sourceFile),
          requiredServices: requiredServicesList,
          dbTypeName: 'DB', // TODO: discover the kysely DB type, don't assume `DB`
        })
        if ('error' in carved) {
          logger.error(carved.error)
          process.exit(1)
        }
        const { result, dbTypesContent } = carved
        if (result.errors.length > 0) {
          for (const e of result.errors) logger.error(e)
          process.exit(1)
        }
        for (const w of result.warnings) logger.warn(w)

        // Keep the scoped DB type in `types/` (not `.pikku/`, which `pikku all`
        // owns and would clobber). It and db.types ship with the addon.
        const dbFiles = { ...result.files }
        delete dbFiles['.pikku/addon-db.gen.ts']
        Object.assign(addonFiles, dbFiles)
        addonFiles['types/db.types.ts'] = dbTypesContent
        addonFiles['types/addon-db.gen.ts'] = generateScopedDbTypes(
          result.owned,
          "import type { DB } from './db.types.js'"
        )

        // kysely must resolve when the addon — and its consumer — compiles.
        const pkg = JSON.parse(addonFiles['package.json']!)
        pkg.peerDependencies = { ...pkg.peerDependencies, kysely: '*' }
        pkg.devDependencies = { ...pkg.devDependencies, kysely: '*' }
        addonFiles['package.json'] = JSON.stringify(pkg, null, 2)

        logger.info(
          `Carved DB addon owns table(s): ${result.owned.join(', ') || '(none)'}`
        )
      }

      // Unified application-types: kysely (scoped) + every carved user service.
      addonFiles['types/application-types.d.ts'] = buildApplicationTypes({
        hasKysely,
        imports: svc.imports,
        members: svc.members,
      })

      const cfg = JSON.parse(addonFiles['pikku.config.json'])
      if (typeof cfg.addon === 'boolean' || !cfg.addon) cfg.addon = {}
      cfg.addon.carve = true
      addonFiles['pikku.config.json'] = JSON.stringify(cfg, null, 2)

      logger.info(
        `Bundled ${bundled.length} function(s) into the addon` +
          (skipped.length > 0
            ? `; skipped ${skipped.length} without a source file (${skipped.join(', ')})`
            : '')
      )
    }

    const written = await writeFiles(addonDir, addonFiles)

    // Test harness
    if (test) {
      const testFiles = getTestFiles(vars)
      const testWritten = await writeFiles(join(addonDir, 'test'), testFiles)
      written.push(...testWritten)
    }

    // Initialize version manifest
    const manifestPath = join(addonDir, 'versions.pikku.json')
    await saveManifest(manifestPath, createEmptyManifest())

    logger.info(`Created addon at ${addonDir}`)
    for (const f of written) {
      logger.debug({ message: `  ${f}`, type: 'success' })
    }

    console.log(addonDir)
  },
})
