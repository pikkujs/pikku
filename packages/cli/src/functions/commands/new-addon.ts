import { existsSync, readFileSync } from 'fs'
import { dirname, join, relative as relativePath, sep } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { spawnSync } from 'node:child_process'
import { findInstallRoot } from './update.js'
import {
  createEmptyManifest,
  saveManifest,
} from '../../utils/contract-versions.js'
import { pikkuSessionlessFunc } from '#pikku/function'
import {
  parseOpenAPISpec,
  computeContractHash,
  detectLoginOperation,
  filterOperations,
  generateAddonFromOpenAPI,
  loadAuthConfig,
  specCoverageWarning,
  type AuthConfig,
  type ParsedSpec,
} from '@pikku/openapi-parser'
import { installAddonIntoApp, type AddonAuthMode } from './install-addon.js'

/**
 * Pick the protocol the generated test app uses to depend on its parent addon.
 *
 * Inside a workspace this must be `workspace:*`. The `file:` protocol copies
 * the whole parent directory rather than honouring its `files` field, so the
 * copy includes the parent's own test/node_modules — which already holds a
 * copy. Every install then adds another layer until the path exceeds the OS
 * limit. Outside a workspace `workspace:*` cannot resolve, so `file:` remains
 * the only option there.
 */
export function resolveAddonDepProtocol(baseDir: string): string {
  let dir = baseDir
  while (true) {
    const manifest = join(dir, 'package.json')
    if (existsSync(manifest)) {
      try {
        const { workspaces } = JSON.parse(readFileSync(manifest, 'utf8'))
        if (Array.isArray(workspaces) || Array.isArray(workspaces?.packages)) {
          return 'workspace:*'
        }
      } catch {
        // A malformed manifest tells us nothing about the workspace layout;
        // keep walking up rather than failing the scaffold.
      }
    }
    const parent = dirname(dir)
    if (parent === dir) {
      return 'file:..'
    }
    dir = parent
  }
}

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

/**
 * `--display-name` and `--description` are free-form prose, so an apostrophe in
 * them is ordinary — "Bob's CRM". `JSON.stringify` emits a valid, escaped
 * string literal; interpolating the raw text into a quoted one terminates the
 * string and the scaffolded file no longer parses. Prose composed with other
 * words is stringified as a whole, not swapped in place.
 */
const literal = (value: string) => JSON.stringify(value)

/**
 * The same prose inside a generated template literal, where a backtick or a
 * `${` opens an interpolation rather than ending the string — so the emitted
 * message keeps its own `\${response.status}` holes.
 */
const inTemplate = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')

/** The same prose on a `//` comment line, where a newline ends the comment. */
const inComment = (value: string) => value.replace(/\s+/g, ' ').trim()

export type CredentialType = 'apikey' | 'bearer' | 'basic' | 'oauth2'

const CREDENTIAL_SHAPES: Record<Exclude<CredentialType, 'oauth2'>, string> = {
  apikey: '{ apiKey: string }',
  bearer: '{ token: string }',
  basic: '{ username: string; password: string }',
}

const CREDENTIAL_FIELDS = { apikey: 'apiKey', bearer: 'token' } as const

export interface AddonVars {
  name: string
  camelName: string
  pascalName: string
  screamingName: string
  displayName: string
  description: string
  category: string
  addonDepProtocol: string
}

const ICON_COLOURS = [
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#16a34a',
  '#0891b2',
]

function placeholderIcon(displayName: string): string {
  const letter = (displayName.match(/[A-Za-z0-9]/)?.[0] ?? '?').toUpperCase()
  const colour =
    ICON_COLOURS[
      [...displayName].reduce((sum, c) => sum + c.charCodeAt(0), 0) %
        ICON_COLOURS.length
    ]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${colour}"/><text x="32" y="43" font-family="system-ui, sans-serif" font-size="30" font-weight="600" fill="#fff" text-anchor="middle">${letter}</text></svg>
`
}

export function getAddonFiles(
  vars: AddonVars,
  flags: {
    secret: boolean
    variable: boolean
    oauth: boolean
    credential?: CredentialType
    /** Delegated login: credential is the upstream token + expiry, checked per call. */
    delegated?: boolean
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
      // Everything an installed package reaches for lives under dist. The
      // addon's own build resolves #pikku through tsconfig `paths` instead, so
      // these never have to point at the source tree.
      imports: {
        '#pikku/*.js': './dist/.pikku/*.js',
        '#pikku/*': ['./dist/.pikku/*/index.js', './dist/.pikku/*'],
      },
      // An addon's generated tree roots at `.pikku/addon/`, but a consumer
      // reaches it by the same subpath an application would — the leaf is the
      // package's business, not its callers'.
      exports: {
        '.': {
          types: './dist/src/index.d.ts',
          import: './dist/src/index.js',
        },
        './.pikku/*': './dist/.pikku/addon/*',
        './.pikku/pikku-metadata.gen.json':
          './dist/.pikku/addon/pikku-metadata.gen.json',
        './.pikku/rpc/pikku-rpc-wirings-map.internal.gen.js': {
          types:
            './dist/.pikku/addon/rpc/pikku-rpc-wirings-map.internal.gen.d.ts',
        },
      },
      files: ['dist'],
      scripts: {
        prepublishOnly: 'yarn build',
        prebuild: 'pikku all',
        build: 'tsc && pikku dist',
        pikku: 'pikku all',
      },
      peerDependencies: {
        '@pikku/core': '*',
        zod: '^4',
      },
      devDependencies: {
        '@pikku/cli': '*',
        '@pikku/core': '*',
        '@pikku/inspector': '*',
        '@standard-schema/spec': '^1.1.0',
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
      addon: {
        displayName,
        description,
        categories: [category],
        icon: `./${name}.svg`,
      },
      forceRequiredServices: [camelName],
    },
    null,
    2
  )

  files[`${name}.svg`] = placeholderIcon(displayName)

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
          '#pikku/*.js': ['./.pikku/*.ts'],
          '#pikku/*': ['./.pikku/*/index.ts', './.pikku/*'],
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

1. Replace the placeholder icon at \`${name}.svg\`
2. Update secret schema with required fields
3. Implement API service methods
4. Create function files for each operation
5. Export functions in \`src/index.ts\`
6. Build: \`yarn install && yarn pikku && yarn build\`
`

  // src/index.ts
  files['src/index.ts'] = `// ${inComment(displayName)} functions
// export { ${camelName}Operation } from './functions/operation.function.js'
`

  // src/services.ts
  const wireCredential = (
    shape: string,
    check: string,
    missing: string,
    extra = ''
  ) => `import { ${missing.startsWith('new MissingCredentialError') ? 'MissingCredentialError' : 'CredentialRejectedError'} } from '@pikku/core/errors'
import { ${pascalName}Service } from './${name}-api.service.js'
import { pikkuAddonWireServices } from '#pikku/addon/setup'

export const createWireServices = pikkuAddonWireServices(
  async ({ variables }, wire) => {
    if (!wire.getCredential) {
      throw new Error('Credential resolution is not available in this runtime')
    }
    const cred = await wire.getCredential<${shape}>('${camelName}')
    if (!${check}) {
      throw ${missing}
    }${extra}
    const ${camelName} = new ${pascalName}Service(cred, variables)

    return { ${camelName} }
  }
)
`
  if (flags.delegated) {
    // Delegated login: the credential is the upstream token captured at
    // sign-in, so a missing or expired one means signing in again.
    files['src/services.ts'] = wireCredential(
      '{ token: string; expiresAt?: number }',
      'cred?.token',
      `new CredentialRejectedError('${camelName}', 'sign-in', ${literal(`No ${displayName} session — sign in again`)})`,
      `
    if (cred.expiresAt && cred.expiresAt * 1000 < Date.now()) {
      throw new CredentialRejectedError('${camelName}', 'sign-in', ${literal(`${displayName} session expired — sign in again`)})
    }`
    )
  } else if (flags.credential && flags.credential !== 'oauth2') {
    const shape = CREDENTIAL_SHAPES[flags.credential]
    const field =
      flags.credential === 'basic'
        ? 'username'
        : CREDENTIAL_FIELDS[flags.credential]
    files['src/services.ts'] = wireCredential(
      shape,
      `cred?.${field}`,
      `new MissingCredentialError('${camelName}', 'apikey')`
    )
  } else if (flags.oauth || flags.credential === 'oauth2') {
    // The OAuth2 access token is owned and refreshed by the platform credential
    // service (better-auth). Resolve a ready token per-request via the wire and
    // hand it to the service — the addon does not do its own token exchange.
    files['src/services.ts'] = wireCredential(
      '{ accessToken: string }',
      'cred?.accessToken',
      `new MissingCredentialError('${camelName}', 'oauth2')`
    )
  } else if (flags.secret) {
    files['src/services.ts'] =
      `import { ${pascalName}Service } from './${name}-api.service.js'
import type { ${pascalName}Secrets } from './${name}.secret.js'
import { pikkuAddonServices } from '#pikku/addon/setup'

export const createSingletonServices = pikkuAddonServices(async (
  config,
  { secrets, variables }
) => {
  const creds = await secrets.getSecret<${pascalName}Secrets>('${screamingName}_CREDENTIALS')
  const ${camelName} = new ${pascalName}Service(creds.reveal(), variables)

  return { ${camelName} }
})
`
  } else {
    files['src/services.ts'] =
      `import { ${pascalName}Service } from './${name}-api.service.js'
import { pikkuAddonServices } from '#pikku/addon/setup'

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
    const credType = CREDENTIAL_SHAPES[flags.credential]
    const authLine = {
      bearer: `'Authorization': \`Bearer \${this.creds.token}\`,`,
      apikey: `'Authorization': \`Bearer \${this.creds.apiKey}\`,`,
      basic: `'Authorization': \`Basic \${btoa(\`\${this.creds.username}:\${this.creds.password}\`)}\`,`,
    }[flags.credential]
    files[`src/${name}-api.service.ts`] =
      `import type { TypedVariablesService } from '#pikku/addon/variables/pikku-variables.gen.js'

const BASE_URL = 'https://api.example.com/v1'

export interface RequestOptions {
  body?: unknown
  qs?: Record<string, string | number | boolean | undefined>
}

export class ${pascalName}Service {
  constructor(
    private creds: ${credType},
    _variables?: TypedVariablesService
  ) {}

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
      throw new Error(\`${inTemplate(displayName)} API error (\${response.status}): \${errorText}\`)
    }

    return response.json() as Promise<T>
  }
}
`
  } else if (flags.oauth) {
    // The access token is resolved (and refreshed) by the platform credential
    // service and injected via createWireServices — this service just uses it.
    files[`src/${name}-api.service.ts`] =
      `import type { TypedVariablesService } from '#pikku/addon/variables/pikku-variables.gen.js'

const BASE_URL = 'https://api.example.com/v1'

export interface RequestOptions {
  body?: unknown
  qs?: Record<string, string | number | boolean | undefined>
}

export class ${pascalName}Service {
  constructor(
    private creds: { accessToken: string },
    _variables?: TypedVariablesService
  ) {}

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
        'Authorization': \`Bearer \${this.creds.accessToken}\`,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(\`${inTemplate(displayName)} API error (\${response.status}): \${errorText}\`)
    }

    return response.json() as Promise<T>
  }
}
`
  } else if (flags.secret) {
    files[`src/${name}-api.service.ts`] =
      `import type { ${pascalName}Secrets } from './${name}.secret.js'
import type { TypedVariablesService } from '#pikku/addon/variables/pikku-variables.gen.js'

const BASE_URL = 'https://api.example.com/v1'

export interface RequestOptions {
  body?: unknown
  qs?: Record<string, string | number | boolean | undefined>
}

export class ${pascalName}Service {
  constructor(
    private creds: ${pascalName}Secrets,
    _variables?: TypedVariablesService
  ) {}

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
      throw new Error(\`${inTemplate(displayName)} API error (\${response.status}): \${errorText}\`)
    }

    return response.json() as Promise<T>
  }
}
`
  } else {
    files[`src/${name}-api.service.ts`] =
      `import type { TypedVariablesService } from '#pikku/addon/variables/pikku-variables.gen.js'

const BASE_URL = 'https://api.example.com/v1'

export interface RequestOptions {
  body?: unknown
  qs?: Record<string, string | number | boolean | undefined>
}

export class ${pascalName}Service {
  constructor(_variables?: TypedVariablesService) {}

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
      throw new Error(\`${inTemplate(displayName)} API error (\${response.status}): \${errorText}\`)
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
} from '@pikku/core/types'
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
import { defineCredential } from '#pikku/addon/auth'

export const ${camelName}CredentialSchema = z.object({
  apiKey: z.string().describe(${literal(`${displayName} API key`)}),
})

defineCredential({
  name: '${camelName}',
  displayName: ${literal(displayName)},
  description: ${literal(description)},
  type: 'wire',
  schema: ${camelName}CredentialSchema,
})
`
  } else if (flags.credential === 'basic') {
    files[`src/${name}.credential.ts`] = `import { z } from 'zod'
import { defineCredential } from '#pikku/addon/auth'

export const ${camelName}CredentialSchema = z.object({
  username: z.string().describe(${literal(`${displayName} username`)}),
  password: z.string().describe(${literal(`${displayName} password`)}),
})

defineCredential({
  name: '${camelName}',
  displayName: ${literal(displayName)},
  description: ${literal(description)},
  type: 'wire',
  schema: ${camelName}CredentialSchema,
})
`
  } else if (flags.credential === 'bearer') {
    const credentialFields = flags.delegated
      ? `  token: z.string().describe(${literal(`${displayName} session token captured at delegated sign-in`)}),
  expiresAt: z.number().optional().describe('Token expiry (epoch seconds)'),
  tenantId: z.string().optional().describe('Upstream tenant id'),`
      : `  token: z.string().describe(${literal(`${displayName} bearer token`)}),`
    files[`src/${name}.credential.ts`] = `import { z } from 'zod'
import { defineCredential } from '#pikku/addon/auth'

export const ${camelName}CredentialSchema = z.object({
${credentialFields}
})

defineCredential({
  name: '${camelName}',
  displayName: ${literal(displayName)},
  description: ${literal(description)},
  type: 'wire',
  schema: ${camelName}CredentialSchema,
})
`
  } else if (flags.oauth || flags.credential === 'oauth2') {
    files[`src/${name}.credential.ts`] = `import { z } from 'zod'
import { defineCredential } from '#pikku/addon/auth'
import { defineSecret } from '#pikku/addon/secrets'

export const ${camelName}TokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
})

defineCredential({
  name: '${camelName}',
  displayName: ${literal(displayName)},
  description: ${literal(description)},
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

defineSecret({
  name: '${camelName}OAuthApp',
  displayName: ${literal(`${displayName} OAuth App`)},
  description: ${literal(`OAuth2 app credentials for ${displayName}`)},
  secretId: '${screamingName}_OAUTH_APP',
})
`
  } else if (flags.secret) {
    files[`src/${name}.secret.ts`] = `import { z } from 'zod'
import { defineSecret } from '#pikku/addon/secrets'

export const ${camelName}SecretsSchema = z.object({
  apiKey: z.string().describe(${literal(`${displayName} API key`)}),
  // Add other secret fields as needed
})

export type ${pascalName}Secrets = z.infer<typeof ${camelName}SecretsSchema>

defineSecret({
  name: '${camelName}',
  displayName: ${literal(`${displayName} API`)},
  description: ${literal(description)},
  secretId: '${screamingName}_CREDENTIALS',
  schema: ${camelName}SecretsSchema,
})
`
  }

  // Conditional: variable file
  if (flags.variable) {
    files[`src/${name}.variable.ts`] = `import { z } from 'zod'
import { defineVariable } from '#pikku/addon/variables'

export const ${camelName}VariableSchema = z.string().optional().describe('TODO: describe this variable')

defineVariable({
  name: '${camelName}_variable',
  displayName: ${literal(`${displayName} Variable`)},
  description: 'TODO: describe this variable',
  variableId: '${screamingName}_VARIABLE',
  schema: ${camelName}VariableSchema,
})
`
  }

  return files
}

export function getTestFiles(vars: AddonVars): Record<string, string> {
  const { name, camelName, pascalName, screamingName, addonDepProtocol } = vars
  const files: Record<string, string> = {}

  // test/package.json
  files['package.json'] = JSON.stringify(
    {
      name: `@pikku/test-${name}`,
      private: true,
      type: 'module',
      imports: {
        '#pikku/*.js': './.pikku/*.ts',
        '#pikku/*': ['./.pikku/*/index.ts', './.pikku/*'],
      },
      scripts: {
        pretest: 'pikku all',
        test: 'node --import tsx --test src/**/*.test.ts',
      },
      dependencies: {
        '@pikku/core': '*',
        [`@pikku/addon-${name}`]: addonDepProtocol,
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
          '#pikku/*.js': ['./.pikku/*.ts'],
          '#pikku/*': ['./.pikku/*/index.ts', './.pikku/*'],
        },
      },
      include: ['src/*', '.pikku/**/*', 'types/**/*'],
      exclude: ['node_modules', '.pikku/**/*.d.ts'],
    },
    null,
    2
  )

  // test/src/addons.ts
  files['src/addons.ts'] = `import { wireAddon } from '#pikku/addon'

wireAddon({ name: '${name}', package: '@pikku/addon-${name}' })
`

  // test/src/services.ts
  files['src/services.ts'] = `import {
  ConsoleLogger,
  LocalVariablesService,
  LocalSecretService,
} from '@pikku/core/services'
import { pikkuServices } from '#pikku/function'

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
import { pikkuSessionlessFunc } from '#pikku/function'

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
import { stopSingletonServices } from '@pikku/core/utils'
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

/**
 * Does `root`'s `workspaces` field cover `dir`?
 *
 * Declaring workspaces is not enough — a root with `packages/*` does not own an
 * addon written to `addons/crm`, and yarn, npm and pnpm all skip a nested
 * package they were never told about.
 */
export function workspaceCovers(root: string, dir: string): boolean {
  const relative = relativePath(root, dir).split(sep).join('/')
  if (relative === '' || relative.startsWith('..')) {
    return false
  }

  let patterns: unknown
  try {
    const manifest = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8')
    )
    patterns = Array.isArray(manifest.workspaces)
      ? manifest.workspaces
      : manifest.workspaces?.packages
  } catch {
    return false
  }
  if (!Array.isArray(patterns)) {
    return false
  }

  return patterns.some((pattern) => {
    if (typeof pattern !== 'string') {
      return false
    }
    const source = pattern
      .split('/')
      .map((segment) =>
        segment === '**'
          ? '.*'
          : segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')
      )
      .join('/')
    return new RegExp(`^${source}$`).test(relative)
  })
}

/**
 * An addon that has not been built is dead at runtime.
 *
 * The generated package exports `./dist/...` — that is what an installed
 * consumer resolves, and what the app's own `pikku-bootstrap.gen.ts` imports.
 * Until `build` has run, every `ref('<addon>:...')` resolves to nothing and the
 * app fails at boot with PKU340 plus an ERR_MODULE_NOT_FOUND on a dist path
 * nobody wrote. Nothing about the generated files shows the problem, so the
 * generator finishes the job: install at the root that owns the lockfile, then
 * run the addon's own `build` script (whose `prebuild` is `pikku all`).
 */
export type AddonBuildRunner = (
  command: string,
  args: string[],
  cwd: string
) => { status: number | null; error?: Error }

const spawnAddonBuildStep: AddonBuildRunner = (command, args, cwd) => {
  const { status, error } = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  return { status, error }
}

export const buildGeneratedAddon = (
  addonDir: string,
  logger: { info: (message: string) => void; error: (message: string) => void },
  run: AddonBuildRunner = spawnAddonBuildStep
): boolean => {
  const { dir: installDir, packageManager } = findInstallRoot(addonDir)
  if (packageManager === 'unknown') {
    logger.error(
      `Could not tell which package manager owns ${addonDir} — the addon is generated but NOT built. Run install, then the addon's build script, in ${addonDir} before using it.`
    )
    return false
  }

  // A root install only reaches the addon when the root's workspace patterns
  // cover it. A root that owns the lockfile but not this package installs
  // nothing for it, so its devDependencies — `@pikku/cli` and `typescript`,
  // which the build script needs — would never arrive.
  const installIn = workspaceCovers(installDir, addonDir)
    ? installDir
    : addonDir

  const steps: Array<[string, string[]]> = [
    [installIn, ['install']],
    [addonDir, ['run', 'build']],
  ]
  for (const [cwd, args] of steps) {
    logger.info(`${packageManager} ${args.join(' ')} (${cwd})`)
    const result = run(packageManager, args, cwd)
    if (result.status !== 0) {
      logger.error(
        `${packageManager} ${args.join(' ')} failed in ${cwd}: ${result.error?.message ?? `exit ${result.status}`}`
      )
      return false
    }
  }
  return true
}

/**
 * `string[]` options split on commas, which would cut a header value like
 * `Accept: a, b` in two; a piece that does not start a new `Name:` rejoins the
 * previous one.
 */
export function parseHeaderOptions(raw: string[] = []): Record<string, string> {
  const joined: string[] = []
  for (const piece of raw) {
    if (/^[A-Za-z0-9!#$%&'*+.^_`|~-]+\s*:/.test(piece) || joined.length === 0) {
      joined.push(piece)
    } else {
      joined[joined.length - 1] += `, ${piece}`
    }
  }
  const headers: Record<string, string> = {}
  for (const header of joined) {
    const at = header.indexOf(':')
    if (at <= 0) {
      throw new Error(`--openapi-header "${header}" is not "Name: value"`)
    }
    headers[header.slice(0, at).trim()] = header.slice(at + 1).trim()
  }
  return headers
}

export interface ResolvedAuth {
  mode: AddonAuthMode
  credential?: CredentialType
  secret: boolean
  oauth: boolean
}

/**
 * How the addon authenticates, from the flags first and the spec second.
 * Per-user is the default for anything the spec can authenticate: each user
 * acts upstream as themselves. `--auth shared` puts one secret behind every
 * user; `--auth none` is for public APIs.
 */
export function resolveAddonAuth(
  spec: ParsedSpec,
  flags: {
    auth?: string
    credential?: string
    oauth?: boolean
    secret?: boolean
    authConfig?: AuthConfig
  }
): ResolvedAuth {
  if (flags.auth && !['user', 'shared', 'none'].includes(flags.auth)) {
    throw new Error(`--auth must be user, shared or none (got "${flags.auth}")`)
  }
  if (flags.authConfig?.delegated) {
    return {
      mode: 'delegated',
      credential: 'bearer',
      secret: false,
      oauth: false,
    }
  }
  if (flags.auth === 'none') {
    return { mode: 'none', secret: false, oauth: false }
  }
  if (
    flags.auth === 'shared' ||
    (flags.secret && !flags.credential && !flags.oauth)
  ) {
    return { mode: 'shared', secret: true, oauth: false }
  }
  const explicit = flags.credential ?? (flags.oauth ? 'oauth2' : undefined)
  const fromSpec: CredentialType | undefined = flags.authConfig?.headerName
    ? 'apikey'
    : (
        {
          oauth2: 'oauth2',
          apiKey: 'apikey',
          bearer: 'bearer',
          basic: 'basic',
          none: undefined,
        } as const
      )[spec.authType]
  const credential = (explicit ?? fromSpec) as CredentialType | undefined
  if (!credential) {
    throw new Error(
      `${spec.info.title} declares no security scheme, so the addon cannot tell how to authenticate. ` +
        'Pass --auth none for a public API, --credential apikey|bearer|basic|oauth2 for a per-user key, ' +
        '--auth shared for one key behind every user, or --auth-config <file> for a custom header or a delegated login (see pikku-build references/openapi.md).'
    )
  }
  if (!['apikey', 'bearer', 'basic', 'oauth2'].includes(credential)) {
    throw new Error(
      `Invalid credential type "${credential}": must be one of apikey, bearer, basic, oauth2`
    )
  }
  return {
    mode: credential === 'oauth2' ? 'oauth2' : 'connect',
    credential,
    secret: false,
    oauth: credential === 'oauth2',
  }
}

/** The project `pikku new addon` runs in, when it is an app rather than an addon. */
function findAppProject(
  config: any
): { root: string; srcDir: string } | undefined {
  const root = config?.rootDir
  if (!root || config.addon || !existsSync(join(root, 'pikku.config.json'))) {
    return undefined
  }
  const src = config.srcDirectories?.[0]
  if (!src) return undefined
  return { root, srcDir: join(root, src) }
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
    openapiHeader?: string[]
    tags?: string[]
    include?: string[]
    exclude?: string[]
    auth?: string
    install?: boolean
    authConfig?: string
    mcp?: boolean
    camelCase?: boolean
    build?: boolean
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
      credential,
      test = true,
      openapi,
      openapiHeader,
      tags,
      include,
      exclude,
      auth,
      install,
      authConfig,
      mcp = false,
      camelCase = false,
      build = true,
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

    const app = findAppProject(config)
    const installing = Boolean(openapi) && (install ?? Boolean(app))
    if (installing && !app) {
      logger.error(
        '--install needs to run inside a pikku app (a pikku.config.json that is not an addon)'
      )
      process.exit(1)
    }

    // Resolve target directory
    const workspacePackages = app ? join(app.root, 'packages') : undefined
    const baseDir =
      dir ||
      config.scaffold?.addonDir ||
      (installing && workspacePackages && existsSync(workspacePackages)
        ? workspacePackages
        : process.cwd())
    // Folder mirrors the package name (@pikku/addon-<name>) so a packages/
    // listing reads as packages/addon-<name>, distinct from app workspaces.
    const addonDir = join(baseDir, `addon-${name}`)

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
      addonDepProtocol: resolveAddonDepProtocol(baseDir),
    }

    let loadedAuthConfig: AuthConfig | undefined
    if (authConfig) {
      loadedAuthConfig = await loadAuthConfig(authConfig)
      if (loadedAuthConfig.delegated && credential && credential !== 'bearer') {
        logger.error(
          `--auth-config with delegated login stores the upstream token per user, so it cannot be combined with --credential ${credential}`
        )
        process.exit(1)
      }
    }

    let spec: ParsedSpec | undefined
    let resolved: ResolvedAuth
    try {
      if (openapi) {
        spec = await parseOpenAPISpec(openapi, {
          headers: parseHeaderOptions(openapiHeader),
        })
        const total = spec.operations.length
        spec = filterOperations(spec, { tags, include, exclude })
        if (spec.operations.length === 0) {
          throw new Error(
            `No operations left out of ${total} after --tags/--include/--exclude`
          )
        }
        const warning = specCoverageWarning(spec)
        if (warning) {
          logger.warn(`\n⚠️  ${warning}\n`)
        }
        resolved = resolveAddonAuth(spec, {
          auth,
          credential,
          oauth,
          secret,
          authConfig: loadedAuthConfig,
        })
        const login = detectLoginOperation(spec)
        if (login && resolved.mode !== 'delegated') {
          logger.info(
            `${spec.info.title} has a login route (${login.method.toUpperCase()} ${login.path}). To let users sign in to the app with their ${resolvedDisplayName} account, pass --auth-config with a "delegated" block (see pikku-build references/openapi.md).`
          )
        }
        logger.info(
          `${spec.operations.length} operations, auth: ${resolved.mode}${resolved.credential ? ` (${resolved.credential})` : ''}`
        )
      } else {
        const credentialType = credential as CredentialType | undefined
        if (
          credentialType &&
          !['apikey', 'bearer', 'basic', 'oauth2'].includes(credentialType)
        ) {
          throw new Error(
            `Invalid credential type "${credential}": must be one of apikey, bearer, basic, oauth2`
          )
        }
        const effectiveOAuth = oauth || credentialType === 'oauth2'
        resolved = {
          mode: effectiveOAuth
            ? 'oauth2'
            : credentialType
              ? 'connect'
              : secret
                ? 'shared'
                : 'none',
          credential: loadedAuthConfig?.delegated ? 'bearer' : credentialType,
          secret: (secret || effectiveOAuth) && !credentialType,
          oauth: effectiveOAuth,
        }
        if (loadedAuthConfig?.delegated) resolved.mode = 'delegated'
      }
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }

    const addonFiles = getAddonFiles(vars, {
      secret: resolved.secret,
      variable,
      oauth: resolved.oauth,
      credential: resolved.credential,
      delegated: resolved.mode === 'delegated',
    })

    if (spec) {
      const openapiFiles = generateAddonFromOpenAPI(spec, vars, {
        oauth: resolved.oauth,
        secret: resolved.secret,
        credential: resolved.credential,
        mcp,
        camelCase,
        authConfig: loadedAuthConfig,
      })
      Object.assign(addonFiles, openapiFiles)

      const config = JSON.parse(addonFiles['pikku.config.json'])
      config.addon.openapi = {
        version: spec.info.version,
        hash: computeContractHash(spec),
        ...(camelCase ? { camelCase: true } : {}),
        ...(loadedAuthConfig ? { authConfig: true } : {}),
      }
      addonFiles['pikku.config.json'] = JSON.stringify(config, null, 2)
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

    if (installing && app && spec) {
      const functions = Object.fromEntries(
        Object.entries(addonFiles)
          .filter(([path]) =>
            /^src\/functions\/[^/]+\.function\.ts$/.test(path)
          )
          .map(([path, source]) => [
            path.slice('src/functions/'.length, -'.function.ts'.length),
            source,
          ])
      )
      const baseUrl = spec.serverUrls.find((url) => /^https?:\/\//.test(url))
      const { written: installed, notes } = installAddonIntoApp({
        projectRoot: app.root,
        srcDir: app.srcDir,
        name,
        camelName: vars.camelName,
        pascalName,
        screamingName: vars.screamingName,
        packageName: `@pikku/addon-${name}`,
        addonDir,
        inWorkspace: workspaceCovers(app.root, addonDir),
        mode: resolved.mode,
        functions,
        baseUrl: baseUrl?.replace(/\/+$/, ''),
      })
      for (const f of installed) logger.info(`  updated ${f}`)
      for (const note of notes) logger.warn(note)
    }

    if (build && !buildGeneratedAddon(addonDir, logger)) {
      process.exit(1)
    }

    console.log(addonDir)
  },
})
