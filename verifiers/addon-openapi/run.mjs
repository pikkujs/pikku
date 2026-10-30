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
 *   catalogue  named by its registry entry (`--openapi example.com:petstore`)
 *              rather than a path or URL, resolved to the entry's swaggerUrl
 *
 * `pikku addons add example.com:petstore` is run inside a scratch app too: the
 * registry name is generated, wired into the app, and its --auth taken from
 * the catalogue entry when none is passed.
 *
 * Besides building, each addon is checked for what a consumer needs from it:
 * the `addon` block and icon the console lists it by, forceRequiredServices so
 * its service survives tree-shaking, a base URL that is a url() with the
 * spec's first server as default, and z.unknown() where the spec's response
 * is missing or too vague to validate against.
 */
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const generatedDir = join(here, 'generated')

const PIKKU =
  process.env.PIKKU_BIN ?? join(repoRoot, 'packages/cli/dist/bin/pikku.js')
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
const petstoreSpec = read(join(here, 'fixtures/petstore.openapi.json'))
const server = createServer((req, res) => {
  const origin = `http://127.0.0.1:${server.address().port}`
  if (req.url === '/specs/petstore.json') {
    res.setHeader('content-type', 'application/json')
    return res.end(petstoreSpec)
  }
  if (req.url.startsWith('/registry/openapis/')) {
    const name = decodeURIComponent(req.url.slice('/registry/openapis/'.length))
    res.setHeader('content-type', 'application/json')
    // The live registry answers an unknown name 200 with an empty body.
    if (name !== 'example.com:petstore') return res.end('')
    return res.end(
      JSON.stringify({
        name,
        version: '1.0.0',
        provider: 'example.com',
        service: 'petstore',
        title: 'Petstore',
        description: 'The tutorial petstore',
        swaggerUrl: `${origin}/specs/petstore.json`,
        authType: 'api_key',
        perUser: false,
      })
    )
  }
  if (req.headers['x-spec-token'] !== 'let-me-in') {
    res.statusCode = 401
    return res.end('{"error":"unauthorized"}')
  }
  res.setHeader('content-type', 'application/json')
  res.end(inventorySpec)
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const specUrl = `http://127.0.0.1:${server.address().port}/openapi.json`
const registryUrl = `http://127.0.0.1:${server.address().port}`

const corpus = [
  {
    name: 'petstore',
    args: [
      '--openapi',
      'fixtures/petstore.openapi.json',
      '--credential',
      'bearer',
    ],
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
    baseUrl: 'https://dolibarr.pikkustudio.cloud/api/index.php',
    unknownOutputs: ['usersRetrieveInfo'],
    delegated: true,
  },
  {
    name: 'catalogue',
    args: [
      '--openapi',
      'example.com:petstore',
      '--registry',
      registryUrl,
      '--credential',
      'bearer',
    ],
    baseUrl: 'https://petstore.example.com/api',
    schemas: ['GetPetInput', 'CreatePetInput', 'ListPetsOutput'],
  },
]

rmSync(generatedDir, { recursive: true, force: true })

let selected = corpus
try {
  const refused = await runAsync(
    'node',
    [
      PIKKU,
      'new',
      'addon',
      'refused',
      '--openapi',
      'fixtures/weather.openapi31.yaml',
      '--dir',
      'generated',
      '--no-build',
    ],
    here
  )
  check(
    refused.status !== 0 && refused.output.includes('--auth none'),
    `a spec without security and without --auth must be refused with a pointer to --auth none, got exit ${refused.status}:\n${refused.output}`
  )

  const unauthorised = await runAsync(
    'node',
    [
      PIKKU,
      'new',
      'addon',
      'unauthorised',
      '--openapi',
      specUrl,
      '--dir',
      'generated',
      '--no-build',
    ],
    here
  )
  check(
    unauthorised.status !== 0 &&
      unauthorised.output.includes('--openapi-header'),
    `a spec URL answering 401 must suggest --openapi-header, got exit ${unauthorised.status}:\n${unauthorised.output}`
  )

  const uncatalogued = await runAsync(
    'node',
    [
      PIKKU,
      'new',
      'addon',
      'uncatalogued',
      '--openapi',
      'example.com:nothing-here',
      '--registry',
      registryUrl,
      '--dir',
      'generated',
      '--no-build',
    ],
    here
  )
  check(
    uncatalogued.status !== 0 &&
      uncatalogued.output.includes('example.com:nothing-here') &&
      uncatalogued.output.includes(registryUrl) &&
      !existsSync(join(generatedDir, 'addon-uncatalogued')),
    `a name the registry does not know must be refused naming it and the registry, with nothing written, got exit ${uncatalogued.status}:\n${uncatalogued.output}`
  )

  const appDir = join(generatedDir, 'app')
  mkdirSync(join(appDir, 'src'), { recursive: true })
  mkdirSync(join(appDir, 'packages'), { recursive: true })
  writeFileSync(
    join(appDir, 'package.json'),
    JSON.stringify(
      { name: 'registry-app', private: true, workspaces: ['packages/*'] },
      null,
      2
    )
  )
  writeFileSync(
    join(appDir, 'pikku.config.json'),
    JSON.stringify(
      {
        srcDirectories: ['src'],
        outDir: '.pikku',
        tsconfig: './tsconfig.json',
      },
      null,
      2
    )
  )
  writeFileSync(join(appDir, 'tsconfig.json'), '{}')

  const added = await runAsync(
    'node',
    [
      PIKKU,
      'addons',
      'add',
      'example.com:petstore',
      '--registry',
      registryUrl,
      '--no-build',
    ],
    appDir
  )
  const addedDir = join(appDir, 'packages', 'addon-example-petstore')
  check(
    added.status === 0,
    `addons add with a registry name must succeed without --auth, got exit ${added.status}:\n${added.output}`
  )
  check(
    added.output.includes('--auth shared, from the registry'),
    `addons add must say it took --auth shared from the registry entry:\n${added.output}`
  )
  check(
    existsSync(join(addedDir, 'package.json')),
    `addons add must generate the addon at ${addedDir}:\n${added.output}`
  )
  check(
    existsSync(join(appDir, 'src', 'example-petstore.addon.ts')),
    `addons add must wire the addon in src/example-petstore.addon.ts:\n${added.output}`
  )

  const addedUnknown = await runAsync(
    'node',
    [
      PIKKU,
      'addons',
      'add',
      'example.com:nothing-here',
      '--registry',
      registryUrl,
      '--no-build',
    ],
    appDir
  )
  check(
    addedUnknown.status !== 0 &&
      addedUnknown.output.includes('example.com:nothing-here') &&
      !existsSync(join(appDir, 'packages', 'addon-example-nothing-here')),
    `addons add with a name the registry does not know must be refused with nothing written, got exit ${addedUnknown.status}:\n${addedUnknown.output}`
  )

  const only = process.env.CORPUS_ONLY?.split(',')
  const unknown =
    only?.filter((name) => !corpus.some((a) => a.name === name)) ?? []
  check(
    unknown.length === 0,
    `CORPUS_ONLY names specs that are not in the corpus: ${unknown.join(', ')}`
  )
  selected = corpus.filter((a) => !only || only.includes(a.name))
  for (const addon of selected) {
    const addonDir = join(generatedDir, `addon-${addon.name}`)
    const camelName = addon.name
    await run(
      `${addon.name}: pikku new addon --openapi`,
      'node',
      [
        PIKKU,
        'new',
        'addon',
        addon.name,
        ...addon.args,
        '--dir',
        'generated',
        '--no-build',
      ],
      here
    )

    const config = JSON.parse(read(join(addonDir, 'pikku.config.json')))
    check(
      !('node' in config),
      `${addon.name}: pikku.config.json still has a "node" block`
    )
    check(
      typeof config.addon === 'object' &&
        config.addon.displayName &&
        config.addon.icon,
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
      variable.includes(
        `z.string().url().default(${JSON.stringify(addon.baseUrl)})`
      ),
      `${addon.name}: base URL must be z.string().url().default(${JSON.stringify(addon.baseUrl)}):\n${variable}`
    )
    check(
      !variable.includes('z.enum'),
      `${addon.name}: base URL must not be an enum`
    )

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
      const credentialFile = join(
        addonDir,
        'src',
        `${addon.name}.credential.ts`
      )
      check(
        existsSync(credentialFile),
        `${addon.name}: per-user ${addon.credential} must declare a credential`
      )
      const service = read(
        join(addonDir, 'src', `${addon.name}-api.service.ts`)
      )
      check(
        service.includes('CredentialRejectedError'),
        `${addon.name}: an upstream 401 on a per-user credential must be a CredentialRejectedError`
      )
    }

    const codegen = await run(
      `${addon.name}: pikku all`,
      'node',
      [PIKKU, 'all'],
      addonDir
    )
    check(
      !codegen.includes('Could not convert Zod schema'),
      `${addon.name}: pikku all left zod schemas unconverted:\n${codegen}`
    )
    await run(`${addon.name}: tsc`, TSC, ['-p', 'tsconfig.json'], addonDir)
    await run(`${addon.name}: pikku dist`, 'node', [PIKKU, 'dist'], addonDir)

    if (
      addon.delegated &&
      process.env.DOLIBARR_LOGIN &&
      process.env.DOLIBARR_PASSWORD
    ) {
      console.log(
        '\n▶ dolibarr: live delegated sign-in (DOLIBARR_LOGIN is set)'
      )
      const { authenticateDolibarrUpstream } = await import(
        join(addonDir, 'dist', 'src', 'dolibarr-upstream-auth.js')
      )
      const identity = await authenticateDolibarrUpstream(
        {
          login: process.env.DOLIBARR_LOGIN,
          password: process.env.DOLIBARR_PASSWORD,
        },
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
      const out = join(
        addonDir,
        'dist',
        '.pikku',
        'addon',
        'schemas',
        'schemas',
        `${name}.schema.json`
      )
      check(
        existsSync(out),
        `${addon.name}: the built addon has no JSON schema for ${name}`
      )
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
console.log(
  `\n✓ ${selected.length} OpenAPI specs generate, build and ship as addons`
)
