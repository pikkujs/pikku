/**
 * Offline verifier for `pikku app native`.
 *
 * Runs the built CLI against a project with two frontends and reads back what
 * it wrote: the config entry first, then the Tauri project generated from it.
 * No Rust toolchain is needed — generation is pure Node, and whether the
 * result compiles is the job of the generator's own cargo probe.
 */

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO_ROOT = join(process.cwd(), '..', '..')
const PIKKU_BIN = join(REPO_ROOT, 'packages', 'cli', 'dist', 'bin', 'pikku.js')
const APP = mkdtempSync(join(tmpdir(), 'pikku-app-native-'))

type Run = { status: number | null; output: string }

function pikku(args: string[]): Run {
  const run = spawnSync('node', [PIKKU_BIN, ...args], {
    cwd: APP,
    encoding: 'utf-8',
    timeout: 180_000,
  })
  return { status: run.status, output: `${run.stdout}${run.stderr}` }
}

function pikkuOk(args: string[]): string {
  const run = pikku(args)
  assert(
    run.status === 0,
    `pikku ${args.join(' ')} exited ${run.status}:\n${run.output}`
  )
  return run.output
}

function pikkuRefuses(args: string[], reason: RegExp): void {
  const run = pikku(args)
  assert(run.status !== 0, `pikku ${args.join(' ')} should have failed`)
  assert(
    reason.test(run.output),
    `pikku ${args.join(' ')} failed without saying ${reason}:\n${run.output}`
  )
}

const path = (file: string) => join(APP, file)
const read = (file: string) => readFileSync(path(file), 'utf-8')
const readJson = (file: string) => JSON.parse(read(file))

function writeJson(file: string, data: unknown) {
  mkdirSync(join(path(file), '..'), { recursive: true })
  writeFileSync(path(file), `${JSON.stringify(data, null, 2)}\n`)
}

const config = () => readJson('pikku.config.json')
const setFrontends = (frontends: Record<string, unknown>) =>
  writeJson('pikku.config.json', { ...config(), frontends })

function scaffold() {
  writeJson('package.json', { name: '@acme/store', private: true })
  writeJson('tsconfig.json', {})
  writeJson('pikku.config.json', {
    tsconfig: './tsconfig.json',
    srcDirectories: ['src'],
    outDir: '.pikku',
    frontends: {
      shop: { cwd: 'apps/shop', kind: 'spa' },
      desk: { cwd: 'apps/desk' },
    },
  })
  writeJson('apps/shop/package.json', {
    name: 'shop',
    devDependencies: { '@tauri-apps/cli': '2.1.0' },
  })
  writeJson('apps/desk/package.json', { name: 'desk' })
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const results: { name: string; status: 'passed' | 'failed'; error?: string }[] =
  []
let failures = 0

function check(name: string, fn: () => void) {
  try {
    fn()
    results.push({ name, status: 'passed' })
  } catch (e) {
    failures++
    results.push({ name, status: 'failed', error: (e as Error).message })
  }
}

scaffold()

check('the built CLI is the one under test', () => {
  assert(existsSync(PIKKU_BIN), `no CLI build at ${PIKKU_BIN}`)
  const help = pikkuOk(['app', '--help'])
  assert(
    /package one as a desktop or mobile app/.test(help),
    `this CLI has no \`pikku app\` group:\n${help}`
  )
})

check('init saves the native entry, then writes the project from it', () => {
  pikkuOk([
    'app',
    'native',
    'init',
    'shop',
    '--desktop',
    '--android',
    '--plugins',
    'store,dialog',
  ])

  const native = config().frontends.shop.native
  assert(
    native.identifier === 'com.acme.shop',
    `identifier ${native.identifier}`
  )
  assert(
    JSON.stringify(native.platforms) === '["desktop","android"]',
    `platforms ${JSON.stringify(native.platforms)}`
  )

  const conf = readJson('apps/shop/src-tauri/tauri.conf.json')
  assert(conf.identifier === 'com.acme.shop', `conf ${conf.identifier}`)
  assert(
    conf.build.frontendDist === '../dist',
    `frontendDist ${conf.build.frontendDist}`
  )
  assert(conf.bundle.externalBin === undefined, 'a bundled UI has no sidecar')

  const cargo = read('apps/shop/src-tauri/Cargo.toml')
  assert(
    /# pikku:plugins:start\n(tauri-plugin-[a-z-]+ = "2"\n)+# pikku:plugins:end/.test(
      cargo
    ),
    `Cargo.toml plugin region:\n${cargo}`
  )
  assert(/tauri-plugin-store = "2"/.test(cargo), 'store is not a dependency')
  assert(/tauri-plugin-dialog = "2"/.test(cargo), 'dialog is not a dependency')
  assert(
    /# pikku:mobile-plugins:start\n# pikku:mobile-plugins:end/.test(cargo),
    'the mobile plugin region should be present and empty'
  )

  assert(
    /tauri_plugin_store/.test(read('apps/shop/src-tauri/src/pikku.rs')),
    'pikku.rs does not initialise the store plugin'
  )
  assert(
    /pikku::plugins\(builder\)/.test(read('apps/shop/src-tauri/src/lib.rs')),
    'lib.rs does not call pikku::plugins'
  )
  const permissions = readJson(
    'apps/shop/src-tauri/capabilities/pikku.json'
  ).permissions
  assert(
    permissions.includes('store:default') &&
      permissions.includes('dialog:default'),
    `capability permissions ${JSON.stringify(permissions)}`
  )
})

check('init lists an icon for every desktop bundler, and writes each', () => {
  const conf = readJson('apps/shop/src-tauri/tauri.conf.json')
  const icons: string[] = conf.bundle.icon
  assert(
    icons.some((icon) => icon.endsWith('.ico')),
    `the Windows bundler refuses to run without an .ico: ${JSON.stringify(icons)}`
  )
  for (const icon of icons) {
    assert(
      existsSync(join(APP, 'apps/shop/src-tauri', icon)),
      `${icon} is listed but was not written`
    )
  }
})

check('init adds the Tauri packages and keeps a pinned version', () => {
  const pkg = readJson('apps/shop/package.json')
  assert(
    pkg.devDependencies['@tauri-apps/cli'] === '2.1.0',
    `@tauri-apps/cli was overridden: ${pkg.devDependencies['@tauri-apps/cli']}`
  )
  assert(pkg.dependencies['@tauri-apps/api'], 'no @tauri-apps/api')
  assert(
    pkg.dependencies['@tauri-apps/plugin-store'] &&
      pkg.dependencies['@tauri-apps/plugin-dialog'],
    `plugin packages ${JSON.stringify(pkg.dependencies)}`
  )
  assert(pkg.scripts.tauri === 'tauri', 'no tauri script')
})

check('init --bundle-server gives a desktop app a sidecar', () => {
  pikkuOk(['app', 'native', 'init', 'desk', '--bundle-server'])

  const native = config().frontends.desk.native
  assert(native.bundleServer === true, 'bundleServer was not saved')
  assert(
    JSON.stringify(native.platforms) === '["desktop"]',
    `a bundled server defaults to desktop only, got ${JSON.stringify(native.platforms)}`
  )
  const conf = readJson('apps/desk/src-tauri/tauri.conf.json')
  assert(
    JSON.stringify(conf.bundle.externalBin) === '["binaries/pikku-server"]',
    `externalBin ${JSON.stringify(conf.bundle.externalBin)}`
  )
  assert(
    conf.build.frontendDist === 'ui',
    `frontendDist ${conf.build.frontendDist}`
  )
  assert(
    existsSync(path('apps/desk/src-tauri/ui/index.html')),
    'no placeholder page'
  )
  assert(
    /\.sidecar\("pikku-server"\)/.test(read('apps/desk/src-tauri/src/lib.rs')),
    'lib.rs does not start the sidecar'
  )
})

check(
  'add puts a mobile plugin behind cfg(mobile) and keeps user edits',
  () => {
    const lib = `${read('apps/shop/src-tauri/src/lib.rs')}\n// the user's own line\n`
    writeFileSync(path('apps/shop/src-tauri/src/lib.rs'), lib)

    pikkuOk(['app', 'native', 'add', 'shop', 'haptics'])

    assert(
      JSON.stringify(config().frontends.shop.native.plugins) ===
        '["store","dialog","haptics"]',
      `plugins ${JSON.stringify(config().frontends.shop.native.plugins)}`
    )
    assert(
      /# pikku:mobile-plugins:start\ntauri-plugin-haptics = "2"\n# pikku:mobile-plugins:end/.test(
        read('apps/shop/src-tauri/Cargo.toml')
      ),
      'haptics is not in the mobile plugin region'
    )
    assert(
      /#\[cfg\(mobile\)\]\s+let builder = builder\.plugin\(tauri_plugin_haptics::init\(\)\);/.test(
        read('apps/shop/src-tauri/src/pikku.rs')
      ),
      'haptics is not gated to mobile in pikku.rs'
    )
    assert(
      readJson(
        'apps/shop/src-tauri/capabilities/pikku-mobile.json'
      ).permissions.includes('haptics:default'),
      'no mobile capability for haptics'
    )
    assert(read('apps/shop/src-tauri/src/lib.rs') === lib, 'add rewrote lib.rs')
  }
)

check('upgrade on a project in sync writes nothing', () => {
  const output = pikkuOk(['app', 'native', 'upgrade', 'shop'])
  assert(/already up to date/.test(output), `upgrade wrote files:\n${output}`)
})

check('check passes both apps, warning only about the unbuilt dist', () => {
  const output = pikkuOk(['app', 'native', 'check'])
  assert(/✓ desk/.test(output), `desk did not pass:\n${output}`)
  assert(/holds no built frontend/.test(output), `no dist warning:\n${output}`)
})

check('list --json reports each frontend and how it ships', () => {
  const run = pikkuOk(['app', 'list', '--json'])
  const line = run.split('\n').find((l) => l.startsWith('{"apps"'))
  assert(line, `no JSON result:\n${run}`)
  const apps = JSON.parse(line).apps as Array<{
    name: string
    native: { mode: string } | null
  }>
  const modes = Object.fromEntries(apps.map((a) => [a.name, a.native?.mode]))
  assert(
    modes.shop === 'bundle' && modes.desk === 'sidecar',
    `modes ${JSON.stringify(modes)}`
  )
})

check('check fails once pikku.rs is no longer called', () => {
  const lib = read('apps/shop/src-tauri/src/lib.rs')
  writeFileSync(path('apps/shop/src-tauri/src/lib.rs'), 'pub fn run() {}\n')
  const run = pikku(['app', 'native', 'check', 'shop'])
  writeFileSync(path('apps/shop/src-tauri/src/lib.rs'), lib)
  assert(run.status !== 0, `check passed a lib.rs that ignores pikku.rs`)
  assert(/pikku::plugins/.test(run.output), run.output)
})

check('refuses a server-rendered frontend in bundle mode', () => {
  const frontends = config().frontends
  setFrontends({ ...frontends, site: { cwd: 'apps/site', kind: 'ssr' } })
  pikkuRefuses(['app', 'native', 'init', 'site'], /server-rendered/)
  assert(
    config().frontends.site.native === undefined,
    'a refused init still wrote the config'
  )
  assert(!existsSync(path('apps/site/src-tauri')), 'a refused init wrote files')
})

check('refuses an identifier another app holds', () => {
  pikkuRefuses(
    [
      'app',
      'native',
      'init',
      'site',
      '--url',
      'https://site.example.com',
      '--identifier',
      'com.acme.shop',
    ],
    /already shop's identifier/
  )
})

check('refuses url and bundleServer together', () => {
  const frontends = config().frontends
  frontends.desk.native.url = 'https://desk.example.com'
  setFrontends(frontends)
  pikkuRefuses(
    ['app', 'native', 'upgrade', 'desk'],
    /both "url" and "bundleServer"/
  )
  delete frontends.desk.native.url
  setFrontends(frontends)
})

check('refuses an unknown frontend by naming the known ones', () => {
  pikkuRefuses(
    ['app', 'native', 'init', 'kiosk'],
    /no frontend named "kiosk".*shop/
  )
})

rmSync(APP, { recursive: true, force: true })

console.log('='.repeat(60))
console.log('App Native Verifier Results')
console.log('='.repeat(60))
for (const r of results) {
  console.log(`  ${r.status === 'passed' ? '✓' : '✗'} ${r.name}`)
  if (r.error) console.log(`    ${r.error}`)
}
console.log(`\n${results.length} tests, ${failures} failed`)
if (failures > 0) process.exit(1)
