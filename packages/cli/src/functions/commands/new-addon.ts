import { existsSync } from 'fs'
import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { pikkuSessionlessFunc } from '#pikku'
import { parseOpenAPISpec } from '../../utils/openapi/parse-openapi.js'
import { generateAddonFromOpenAPI } from '../../utils/openapi/codegen.js'

function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

function toPascalCase(str: string): string {
  const camel = toCamelCase(str)
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}

function toScreamingSnake(str: string): string {
  return str.replace(/-/g, '_').toUpperCase()
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
  flags: { secret: boolean; variable: boolean; oauth: boolean }
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
        './.pikku/*': './.pikku/*',
        './.pikku/pikku-metadata.gen.json': './.pikku/pikku-metadata.gen.json',
        './.pikku/rpc/pikku-rpc-wirings-map.internal.gen.js': {
          types: './.pikku/rpc/pikku-rpc-wirings-map.internal.gen.d.ts',
        },
      },
      files: ['dist', '.pikku'],
      scripts: {
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
  if (flags.oauth) {
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
  const creds = await secrets.getSecretJSON<${pascalName}Secrets>('${screamingName}_CREDENTIALS')
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
  if (flags.oauth) {
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

  // Conditional: secret file
  if (flags.oauth) {
    files[`src/${name}.secret.ts`] =
      `import { wireOAuth2Credential } from '@pikku/core/oauth2'

wireOAuth2Credential({
  name: '${camelName}OAuth',
  displayName: '${displayName} OAuth2',
  description: '${displayName} OAuth2 credentials',
  secretId: '${screamingName}_APP_CREDENTIALS',
  tokenSecretId: '${screamingName}_TOKENS',
  authorizationUrl: 'https://example.com/oauth2/authorize',
  tokenUrl: 'https://example.com/oauth2/token',
  scopes: ['read', 'write'],
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
  // await secrets.setSecretJSON('${screamingName}_CREDENTIALS', { ... })

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
    test?: boolean
    openapi?: string
    mcp?: boolean
  },
  void
>({
  func: async (
    { logger, config },
    {
      name,
      displayName,
      description,
      category = 'General',
      dir,
      secret = false,
      variable = false,
      oauth = false,
      test = true,
      openapi,
      mcp = false,
    }
  ) => {
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

    // oauth implies secret
    const addonFiles = getAddonFiles(vars, {
      secret: secret || oauth,
      variable,
      oauth,
    })

    // If openapi spec provided, generate typed files and merge over scaffold
    if (openapi) {
      const spec = await parseOpenAPISpec(openapi)
      const openapiFiles = generateAddonFromOpenAPI(spec, vars, {
        oauth,
        secret: secret || oauth,
        mcp,
      })
      Object.assign(addonFiles, openapiFiles)
    }

    const written = await writeFiles(addonDir, addonFiles)

    // Test harness
    if (test) {
      const testFiles = getTestFiles(vars)
      const testWritten = await writeFiles(join(addonDir, 'test'), testFiles)
      written.push(...testWritten)
    }

    logger.info(`Created addon at ${addonDir}`)
    for (const f of written) {
      logger.debug({ message: `  ${f}`, type: 'success' })
    }

    console.log(addonDir)
  },
})
