/**
 * OpenAPI → addon corpus.
 *
 * Every spec in the corpus goes through the command an agent runs
 * (`pikku new addon <name> --openapi <spec>`) and the generated package's own
 * build (`pikku all`, `tsc`, `pikku dist`), with no hand-fixes in between:
 *
 *   petstore   OpenAPI 3.0, the shape most tutorials show
 *   bookshop   Swagger 2.0: host + basePath, basic auth, formData upload
 *   weather    OpenAPI 3.1 in YAML: server variables, no security at all
 *   inventory  apiKey in a header, fetched from a URL that needs a header
 *   calendar   oauth2 authorizationCode
 *   dolibarr   a real Swagger 2.0 export with delegated login (auth-config)
 *
 * Besides building, each addon is checked for what a consumer needs from it:
 * the `addon` block and icon the console lists it by, forceRequiredServices so
 * its service survives tree-shaking, a base URL that is a url() with the
 * spec's first server as default, and z.unknown() where the spec's response
 * is missing or too vague to validate against.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const generatedDir = join(here, 'generated')

const PIKKU = process.env.PIKKU_BIN ?? join(repoRoot, 'packages/cli/dist/bin/pikku.js')
const TSC = join(repoRoot, 'node_modules/.bin/tsc')

async function run(label, file, args, cwd) {
  console.log(`\n▶ ${label}`)
  const started = Date.now()
  const { status, output } = await runAsync(file, args, cwd)
  if (status !== 0) {
    process.stdout.write(output)
    throw new Error(`${label} exited ${status}`)
  }
  console.log(`  ${((Date.now() - started) / 1000).toFixed(1)}s`)
  return output
}

function runAsync(file, args, cwd) {
  return new Promise((resolvePromise) => {
    const child = spawn(file, args, { cwd, stdio: 'pipe' })
    let output = ''
    child.stdout.on('data', (d) => (output += d))
    child.stderr.on('data', (d) => (output += d))
    child.on('close', (status) => resolvePromise({ status, output }))
  })
}

const failures = []
function check(ok, message) {
  if (!ok) failures.push(message)
}

const read = (path) => readFileSync(path, 'utf8')

const inventorySpec = read(join(here, 'fixtures/inventory.apikey.openapi.json'))
const server = createServer((req, res) => {
  if (req.headers['x-spec-token'] !== 'let-me-in') {
    res.statusCode = 401
    return res.end('{"error":"unauthorized"}')
  }
  res.setHeader('content-type', 'application/json')
  res.end(inventorySpec)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const specUrl = `http://127.0.0.1:${server.address().port}/openapi.json`

const corpus = [
  {
    name: 'petstore',
    args: ['--openapi', 'fixtures/petstore.openapi.json', '--credential', 'bearer'],
    baseUrl: 'https://petstore.example.com/api',
    schemas: ['GetPetInput', 'CreatePetInput', 'ListPetsOutput'],
  },
  {
    name: 'bookshop',
    args: ['--openapi', 'fixtures/bookshop.swagger2.json'],
    baseUrl: 'https://books.example.com/v2',
    credential: 'basic',
  },
  {
    name: 'weather',
    args: ['--openapi', 'fixtures/weather.openapi31.yaml', '--auth', 'none'],
    baseUrl: 'https://eu.weather.example.com/v1',
    unknownOutputs: ['listStations'],
  },
  {
    name: 'inventory',
    args: ['--openapi', specUrl, '--openapi-header', 'X-Spec-Token: let-me-in'],
    baseUrl: 'https://api.inventory.example.com',
    credential: 'apikey',
  },
  {
    name: 'calendar',
    args: ['--openapi', 'fixtures/calendar.oauth2.openapi.json'],
    baseUrl: 'https://calendar.example.com/api/v3',
    credential: 'oauth2',
  },
  {
    name: 'dolibarr',
    args: [
      '--openapi',
      'fixtures/dolibarr.swagger.json',
      '--auth-config',
      'fixtures/dolibarr.auth-config.json',
      '--display-name',
      'Dolibarr',
    ],
    baseUrl: 'https://dolibarr.pikkufabric.cloud/api/index.php',
    unknownOutputs: ['usersRetrieveInfo'],
    delegated: true,
  },
]

rmSync(generatedDir, { recursive: true, force: true })

try {
  const refused = await runAsync(
    'node',
    [PIKKU, 'new', 'addon', 'refused', '--openapi', 'fixtures/weather.openapi31.yaml', '--dir', 'generated', '--no-build'],
    here
  )
  check(
    refused.status !== 0 && refused.output.includes('--auth none'),
    `a spec without security and without --auth must be refused with a pointer to --auth none, got exit ${refused.status}:\n${refused.output}`
  )

  const unauthorised = await runAsync(
    'node',
    [PIKKU, 'new', 'addon', 'unauthorised', '--openapi', specUrl, '--dir', 'generated', '--no-build'],
    here
  )
  check(
    unauthorised.status !== 0 && unauthorised.output.includes('--openapi-header'),
    `a spec URL answering 401 must suggest --openapi-header, got exit ${unauthorised.status}:\n${unauthorised.output}`
  )

  const only = process.env.CORPUS_ONLY?.split(',')
  for (const addon of corpus.filter((a) => !only || only.includes(a.name))) {
    const addonDir = join(generatedDir, `addon-${addon.name}`)
    const camelName = addon.name
    await run(
      `${addon.name}: pikku new addon --openapi`,
      'node',
      [PIKKU, 'new', 'addon', addon.name, ...addon.args, '--dir', 'generated', '--no-build'],
      here
    )

    const config = JSON.parse(read(join(addonDir, 'pikku.config.json')))
    check(!('node' in config), `${addon.name}: pikku.config.json still has a "node" block`)
    check(
      typeof config.addon === 'object' && config.addon.displayName && config.addon.icon,
      `${addon.name}: pikku.config.json "addon" must carry displayName and icon, got ${JSON.stringify(config.addon)}`
    )
    check(
      config.addon?.icon && existsSync(join(addonDir, config.addon.icon)),
      `${addon.name}: the icon ${config.addon?.icon} was not written`
    )
    check(
      config.forceRequiredServices?.includes(camelName),
      `${addon.name}: forceRequiredServices must include ${camelName}, got ${JSON.stringify(config.forceRequiredServices)}`
    )

    const variable = read(join(addonDir, 'src', `${addon.name}.variable.ts`))
    check(
      variable.includes(`z.string().url().default(${JSON.stringify(addon.baseUrl)})`),
      `${addon.name}: base URL must be z.string().url().default(${JSON.stringify(addon.baseUrl)}):\n${variable}`
    )
    check(!variable.includes('z.enum'), `${addon.name}: base URL must not be an enum`)

    const functionsDir = join(addonDir, 'src', 'functions')
    const files = readdirSync(functionsDir)
    for (const f of files.filter((f) => f.endsWith('.schemas.ts'))) {
      check(
        !read(join(functionsDir, f)).includes('#pikku'),
        `${addon.name}: ${f} imports #pikku — codegen cannot load it before the first build`
      )
    }
    for (const fn of addon.unknownOutputs ?? []) {
      const schemas = read(join(functionsDir, `${fn}.schemas.ts`))
      check(
        /Output = z\.unknown\(\)/.test(schemas),
        `${addon.name}: ${fn} has a vague response and must declare z.unknown() output:\n${schemas}`
      )
    }

    const services = read(join(addonDir, 'src', 'services.ts'))
    if (addon.delegated) {
      check(
        existsSync(join(addonDir, 'src', `${addon.name}-upstream-auth.ts`)),
        `${addon.name}: delegated auth-config must generate the upstream-auth file`
      )
      check(
        services.includes("CredentialRejectedError('dolibarr', 'sign-in'"),
        `${addon.name}: a missing delegated session must be a sign-in-again error:\n${services}`
      )
    }
    if (addon.credential) {
      const credentialFile = join(addonDir, 'src', `${addon.name}.credential.ts`)
      check(existsSync(credentialFile), `${addon.name}: per-user ${addon.credential} must declare a credential`)
      const service = read(join(addonDir, 'src', `${addon.name}-api.service.ts`))
      check(
        service.includes('CredentialRejectedError'),
        `${addon.name}: an upstream 401 on a per-user credential must be a CredentialRejectedError`
      )
    }

    const codegen = await run(`${addon.name}: pikku all`, 'node', [PIKKU, 'all'], addonDir)
    check(
      !codegen.includes('Could not convert Zod schema'),
      `${addon.name}: pikku all left zod schemas unconverted:\n${codegen}`
    )
    await run(`${addon.name}: tsc`, TSC, ['-p', 'tsconfig.json'], addonDir)
    await run(`${addon.name}: pikku dist`, 'node', [PIKKU, 'dist'], addonDir)

    if (addon.delegated && process.env.DOLIBARR_LOGIN && process.env.DOLIBARR_PASSWORD) {
      console.log('\n▶ dolibarr: live delegated sign-in (DOLIBARR_LOGIN is set)')
      const { authenticateDolibarrUpstream } = await import(
        join(addonDir, 'dist', 'src', 'dolibarr-upstream-auth.js')
      )
      const identity = await authenticateDolibarrUpstream(
        { login: process.env.DOLIBARR_LOGIN, password: process.env.DOLIBARR_PASSWORD },
        process.env.DOLIBARR_BASE_URL ?? addon.baseUrl
      )
      check(
        identity?.externalId && identity.credential?.token && identity.email,
        `dolibarr: live sign-in returned no usable identity: ${JSON.stringify({ ...identity, credential: identity?.credential ? '…' : undefined })}`
      )
      console.log(
        `  ${identity?.name} → externalId ${identity?.externalId}, email ${identity?.email}${identity?.syntheticEmail ? ' (synthetic)' : ''}, role ${identity?.role ?? '-'}`
      )
      const rejected = await authenticateDolibarrUpstream(
        { login: process.env.DOLIBARR_LOGIN, password: 'not-the-password' },
        process.env.DOLIBARR_BASE_URL ?? addon.baseUrl
      )
      check(rejected === null, 'dolibarr: a wrong password must return null')
    }

    for (const name of addon.schemas ?? []) {
      const out = join(addonDir, 'dist', '.pikku', 'addon', 'schemas', 'schemas', `${name}.schema.json`)
      check(existsSync(out), `${addon.name}: the built addon has no JSON schema for ${name}`)
    }
  }
} catch (error) {
  failures.push(error.message)
} finally {
  server.close()
}

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} problem(s):`)
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}
console.log(`\n✓ ${corpus.length} OpenAPI specs generate, build and ship as addons`)
