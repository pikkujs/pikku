import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { renderPlaceholderIcon } from './icon.js'
import { nativeIdentifierProblems } from './identifier.js'
import { iosUsageDescriptions, resolveNativeApis } from './native.js'
import {
  libName,
  renderLibRs,
  renderMainRs,
  renderPikkuRs,
  SIDECAR_NAME,
} from './rust.js'
import { sidecarFileName } from './target-triple.js'

/** Directory a frontend's native project lives in, relative to its `cwd`. */
export const NATIVE_PROJECT_DIR = 'src-tauri'

export type NativePlatform = 'desktop' | 'android' | 'ios'

/**
 * Where the window's UI comes from.
 *
 * - `bundle` — the frontend's built `dist`, packaged into the app.
 * - `url` — a deployed server's own origin; nothing is packaged.
 * - `sidecar` — the compiled pikku server, spawned by the app. Desktop only.
 */
export type NativeMode =
  | { kind: 'bundle'; frontendDist: string }
  | { kind: 'url'; url: string }
  | { kind: 'sidecar' }

export type NativeProjectSpec = {
  /** Absolute path of the native project — `<cwd>/src-tauri`. */
  dir: string
  /** The frontend's key in `frontends`; names the crate. */
  name: string
  identifier: string
  productName: string
  platforms: readonly NativePlatform[]
  plugins: readonly string[]
  mode: NativeMode
  /** The frontend's dev server, for `tauri dev`. Written once, at init. */
  devUrl?: string
}

export type NativeProblem = {
  level: 'error' | 'warning'
  message: string
  /** `upgrade` when `pikku app native upgrade` fixes it; otherwise the edit to make. */
  fix: string
}

const PLUGINS_START = '# pikku:plugins:start'
const PLUGINS_END = '# pikku:plugins:end'
const MOBILE_PLUGINS_START = '# pikku:mobile-plugins:start'
const MOBILE_PLUGINS_END = '# pikku:mobile-plugins:end'

const DESKTOP_CFG =
  'cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))'
const MOBILE_CFG = 'cfg(any(target_os = "android", target_os = "ios"))'

const ICON_SIZE = 512

const PIKKU_RS = 'src/pikku.rs'
const PIKKU_CAPABILITY = 'capabilities/pikku.json'
const PIKKU_MOBILE_CAPABILITY = 'capabilities/pikku-mobile.json'
const SIDECAR_UI = 'ui/index.html'

const crateName = (name: string): string => `${name}-app`

/**
 * A webview can only open an http(s) origin, and everything url mode exists to
 * preserve — first-party cookies, CORS, OAuth redirects — is keyed on it. A
 * `file:` or custom-scheme url would build fine and then fail at runtime.
 */
const normalizeUrl = (raw: string): string => {
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    throw new Error(`"${raw}" is not a url a native app could open.`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `A native app opens an http or https url; "${raw}" is ${parsed.protocol.replace(':', '')}.`
    )
  }
  return raw.trim()
}

/**
 * Every reason no platform could build `spec`, found before anything is written.
 *
 * A bundled server is a binary for one desktop target; no phone permits
 * spawning it, so asking for one alongside a mobile platform is a
 * contradiction and not a partial success.
 */
export const nativeSpecProblems = (spec: NativeProjectSpec): string[] => {
  const problems = nativeIdentifierProblems(spec.identifier).map(
    (problem) => `identifier: ${problem}`
  )
  if (spec.platforms.length === 0) {
    problems.push(
      'platforms is empty — name at least one of desktop, android, ios'
    )
  }
  if (spec.mode.kind === 'sidecar') {
    const mobile = spec.platforms.filter((p) => p !== 'desktop')
    if (mobile.length > 0) {
      problems.push(
        `bundleServer runs the pikku server as a sidecar, which ${mobile.join(' and ')} ${mobile.length === 1 ? 'does' : 'do'} not permit. Drop ${mobile.join(', ')} from platforms, or drop bundleServer.`
      )
    }
  }
  if (spec.mode.kind === 'url') {
    try {
      normalizeUrl(spec.mode.url)
    } catch (e) {
      problems.push((e as Error).message)
    }
  }
  try {
    resolveNativeApis(spec.plugins)
  } catch (e) {
    problems.push((e as Error).message)
  }
  return problems
}

const assertSpec = (spec: NativeProjectSpec): void => {
  const problems = nativeSpecProblems(spec)
  if (problems.length > 0) {
    throw new Error(
      `Cannot generate the native project for "${spec.name}":\n  - ${problems.join('\n  - ')}`
    )
  }
}

const frontendDistOf = (mode: NativeMode): string => {
  switch (mode.kind) {
    case 'bundle':
      return mode.frontendDist
    case 'url':
      return normalizeUrl(mode.url)
    case 'sidecar':
      // The real UI is served by the sidecar over HTTP and the window is
      // pointed at it from Rust once the port is known. Tauri still requires a
      // frontend directory, so a placeholder page stands in.
      return 'ui'
  }
}

type TauriConfig = {
  productName?: string
  identifier?: string
  build?: { frontendDist?: string; [key: string]: unknown }
  bundle?: { externalBin?: string[]; [key: string]: unknown }
  [key: string]: unknown
}

/** The `tauri.conf.json` keys pikku owns, applied over whatever else is there. */
const applyOwnedConfig = (
  config: TauriConfig,
  spec: NativeProjectSpec
): TauriConfig => {
  const bundle = { ...config.bundle }
  if (spec.mode.kind === 'sidecar') {
    bundle.externalBin = [`binaries/${SIDECAR_NAME}`]
  } else {
    delete bundle.externalBin
  }
  return {
    ...config,
    productName: spec.productName,
    identifier: spec.identifier,
    build: { ...config.build, frontendDist: frontendDistOf(spec.mode) },
    bundle,
  }
}

const renderJson = (value: unknown): string =>
  JSON.stringify(value, null, 2) + '\n'

const renderInitialConfig = (spec: NativeProjectSpec): string =>
  renderJson(
    applyOwnedConfig(
      {
        $schema: 'https://schema.tauri.app/config/2',
        productName: spec.productName,
        version: '0.1.0',
        identifier: spec.identifier,
        build: spec.devUrl ? { devUrl: spec.devUrl } : {},
        app: {
          // A bundled server's origin is not known until it reports its port,
          // so its window is built from Rust. Everything else declares it here.
          windows:
            spec.mode.kind === 'sidecar'
              ? []
              : [
                  {
                    label: 'main',
                    title: spec.productName,
                    width: 1200,
                    height: 800,
                  },
                ],
          security: { csp: null },
        },
        bundle: {
          active: true,
          targets: 'all',
          icon: ['icons/icon.png'],
        },
      },
      spec
    )
  )

const pluginRegions = (
  spec: NativeProjectSpec
): { plugins: string; mobilePlugins: string } => {
  const apis = resolveNativeApis(spec.plugins)
  const dep = (crate: string) => `${crate} = "2"\n`
  return {
    plugins: [
      ...(spec.mode.kind === 'sidecar' ? ['tauri-plugin-shell'] : []),
      ...apis.filter((api) => api.support === 'all').map((api) => api.crate),
    ]
      .map(dep)
      .join(''),
    mobilePlugins: apis
      .filter((api) => api.support === 'mobile')
      .map((api) => dep(api.crate))
      .join(''),
  }
}

const renderCargoToml = (spec: NativeProjectSpec): string => {
  const crate = crateName(spec.name)
  const regions = pluginRegions(spec)
  return `[package]
name = "${crate}"
version = "0.1.0"
edition = "2021"

# A mobile build never calls \`main\`: Android loads the crate as a cdylib through
# JNI and iOS links it as a staticlib. Both need a library target, and its name
# is what main.rs calls into.
[lib]
name = "${libName(crate)}"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

# The two marked blocks below are rewritten by \`pikku app native add\` and
# \`upgrade\` from the frontend's \`native.plugins\`. Add your own crates outside
# them; delete a marker and pikku will refuse to touch this file.
[dependencies]
tauri = { version = "2", features = [] }
${PLUGINS_START}
${regions.plugins}${PLUGINS_END}

# Focusing an already-open window is a desktop concept, and the plugin has no
# build for a mobile target.
[target.'${DESKTOP_CFG}'.dependencies]
tauri-plugin-single-instance = "2"

# Plugins that exist only for iOS and Android; as plain dependencies they would
# break every desktop build of the same crate.
[target.'${MOBILE_CFG}'.dependencies]
${MOBILE_PLUGINS_START}
${regions.mobilePlugins}${MOBILE_PLUGINS_END}

[profile.release]
panic = "abort"
codegen-units = 1
lto = true
strip = true
`
}

const replaceRegion = (
  source: string,
  start: string,
  end: string,
  body: string
): string | undefined => {
  const from = source.indexOf(start)
  const to = source.indexOf(end)
  if (from === -1 || to === -1 || to < from) return undefined
  return `${source.slice(0, from + start.length)}\n${body}${source.slice(to)}`
}

/** Cargo.toml with pikku's regions replaced, or `undefined` if a marker is gone. */
const syncCargoToml = (
  source: string,
  spec: NativeProjectSpec
): string | undefined => {
  const regions = pluginRegions(spec)
  const withPlugins = replaceRegion(
    source,
    PLUGINS_START,
    PLUGINS_END,
    regions.plugins
  )
  return withPlugins === undefined
    ? undefined
    : replaceRegion(
        withPlugins,
        MOBILE_PLUGINS_START,
        MOBILE_PLUGINS_END,
        regions.mobilePlugins
      )
}

/**
 * The origin a native-API grant is scoped to, or `undefined` when the page is
 * the app's own.
 *
 * A bundled UI is loaded from the app itself, and Tauri trusts it without a
 * remote grant. A remote origin gets no IPC access until one is named. A
 * sidecar's port is chosen by the OS at launch and is unknowable here, so the
 * only expressible scope is every port on loopback — wider than one would like,
 * but loopback is not reachable from off the machine and the alternative is an
 * app whose native APIs never work.
 */
export const nativeGrantUrl = (mode: NativeMode): string | undefined => {
  switch (mode.kind) {
    case 'bundle':
      return undefined
    case 'url':
      return new URL(normalizeUrl(mode.url)).origin
    case 'sidecar':
      return 'http://127.0.0.1:*'
  }
}

/**
 * The capability files pikku owns.
 *
 * Split in two because a capability is validated against the platforms it
 * claims, and a mobile-only permission listed for a desktop build is an error
 * rather than a no-op.
 */
const renderCapabilities = (
  spec: NativeProjectSpec
): Record<string, string | undefined> => {
  const apis = resolveNativeApis(spec.plugins)
  const url = nativeGrantUrl(spec.mode)
  const remote = url ? { remote: { urls: [url] } } : {}
  const portable = apis.filter((api) => api.support === 'all')
  const mobileOnly = apis.filter((api) => api.support === 'mobile')
  return {
    [PIKKU_CAPABILITY]: renderJson({
      $schema: '../gen/schemas/desktop-schema.json',
      identifier: 'pikku',
      description: `Written by pikku from native.plugins: the native APIs ${url ?? 'the bundled UI'} may call.`,
      windows: ['main'],
      ...remote,
      permissions: ['core:default', ...portable.map((api) => api.permission)],
    }),
    [PIKKU_MOBILE_CAPABILITY]:
      mobileOnly.length > 0
        ? renderJson({
            $schema: '../gen/schemas/mobile-schema.json',
            identifier: 'pikku-mobile',
            description:
              'Written by pikku from native.plugins: the native APIs that exist only on a phone.',
            windows: ['main'],
            platforms: ['iOS', 'android'],
            ...remote,
            permissions: mobileOnly.map((api) => api.permission),
          })
        : undefined,
  }
}

const PLACEHOLDER_UI = `<!doctype html>
<meta charset="utf-8" />
<title>Starting…</title>
<p>Starting…</p>
`

/**
 * Files pikku rewrites on every run. An `undefined` body means the file should
 * not exist — the mobile capability once its last plugin is removed.
 */
const renderOwnedFiles = (
  spec: NativeProjectSpec
): Record<string, string | undefined> => ({
  [PIKKU_RS]: renderPikkuRs({
    plugins: resolveNativeApis(spec.plugins),
    bundleServer: spec.mode.kind === 'sidecar',
  }),
  ...renderCapabilities(spec),
  [SIDECAR_UI]: spec.mode.kind === 'sidecar' ? PLACEHOLDER_UI : undefined,
})

/**
 * iOS refuses a guarded API without a reason to show the person being asked —
 * it terminates the process rather than returning an error, so a missing key is
 * a crash on first use and not a failed call. Tauri merges this file into the
 * generated app's Info.plist.
 */
const renderIosPlist = (entries: Record<string, string>): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
${Object.entries(entries)
  .map(([key, value]) => `    <key>${key}</key>\n    <string>${value}</string>`)
  .join('\n')}
  </dict>
</plist>
`

// `gen/schemas` is regenerated on every build, but `gen/android` and
// `gen/apple` are the Gradle and Xcode projects: they carry the manifest, the
// signing setup and any app-link entry, and are meant to be committed.
// `binaries/` holds a server compiled for one machine, so it never is.
const GITIGNORE = `/target
/binaries
/gen/schemas
`

const readText = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, 'utf-8')
  } catch {
    return undefined
  }
}

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

const writeText = async (path: string, content: string | Buffer) => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

export type NativeWriteResult = {
  /** Files written or removed, relative to the project. */
  written: string[]
}

/**
 * Write a new native project. Refuses a directory that already holds one:
 * everything but pikku's own files is the user's from here on, and
 * {@link syncNativeProject} is how pikku's half is brought up to date.
 */
export const createNativeProject = async (
  spec: NativeProjectSpec
): Promise<NativeWriteResult> => {
  assertSpec(spec)
  if (await exists(join(spec.dir, 'tauri.conf.json'))) {
    throw new Error(
      `${spec.dir} already holds a native project. Use \`pikku app native upgrade ${spec.name}\` to bring pikku's files up to date.`
    )
  }

  const plist = iosUsageDescriptions(resolveNativeApis(spec.plugins))
  const files: Record<string, string | Buffer | undefined> = {
    'tauri.conf.json': renderInitialConfig(spec),
    'Cargo.toml': renderCargoToml(spec),
    'build.rs': 'fn main() {\n    tauri_build::build()\n}\n',
    'src/main.rs': renderMainRs(crateName(spec.name)),
    'src/lib.rs': renderLibRs({ bundleServer: spec.mode.kind === 'sidecar' }),
    'icons/icon.png': renderPlaceholderIcon(ICON_SIZE),
    '.gitignore': GITIGNORE,
    'Info.ios.plist':
      Object.keys(plist).length > 0 ? renderIosPlist(plist) : undefined,
    ...renderOwnedFiles(spec),
  }

  const written: string[] = []
  for (const [path, content] of Object.entries(files)) {
    if (content === undefined) continue
    await writeText(join(spec.dir, path), content)
    written.push(path)
  }
  return { written }
}

/**
 * Bring pikku's half of an existing native project in line with its spec:
 * rewrite the files pikku owns, the marked regions of `Cargo.toml` and the
 * `tauri.conf.json` keys pikku owns. Nothing else is written.
 */
export const syncNativeProject = async (
  spec: NativeProjectSpec
): Promise<NativeWriteResult> => {
  assertSpec(spec)
  const configText = await readText(join(spec.dir, 'tauri.conf.json'))
  if (configText === undefined) {
    throw new Error(
      `No native project at ${spec.dir}. Create one with \`pikku app native init ${spec.name}\`.`
    )
  }
  const cargoPath = join(spec.dir, 'Cargo.toml')
  const cargoText = (await readText(cargoPath)) ?? ''
  const cargo = syncCargoToml(cargoText, spec)
  if (cargo === undefined) {
    throw new Error(
      `${cargoPath} is missing the "${PLUGINS_START}" … "${PLUGINS_END}" or "${MOBILE_PLUGINS_START}" … "${MOBILE_PLUGINS_END}" markers, so pikku cannot tell which dependencies are its own. Put them back around the tauri-plugin-* lines pikku manages.`
    )
  }

  const written: string[] = []
  const put = async (
    path: string,
    before: string | undefined,
    after: string
  ) => {
    if (before === after) return
    await writeText(join(spec.dir, path), after)
    written.push(path)
  }

  await put('Cargo.toml', cargoText, cargo)
  await put(
    'tauri.conf.json',
    configText,
    renderJson(applyOwnedConfig(JSON.parse(configText), spec))
  )
  for (const [path, content] of Object.entries(renderOwnedFiles(spec))) {
    const target = join(spec.dir, path)
    const before = await readText(target)
    if (content !== undefined) {
      await put(path, before, content)
    } else if (before !== undefined) {
      await rm(target)
      written.push(path)
    }
  }
  return { written }
}

const REINIT =
  'move src-tauri aside, re-run `pikku app native init`, then carry your edits over'

/**
 * Everything wrong with a native project, as checks rather than repairs.
 *
 * Pikku's half is compared with what {@link syncNativeProject} would write, so
 * any drift there is one `upgrade` away. The user's half is only inspected for
 * the few things pikku depends on, and each problem names the edit to make,
 * because pikku does not write those files.
 */
export const checkNativeProject = async (
  spec: NativeProjectSpec,
  options: { distDir?: string } = {}
): Promise<NativeProblem[]> => {
  const invalid = nativeSpecProblems(spec)
  if (invalid.length > 0) {
    return invalid.map((message) => ({
      level: 'error',
      message,
      fix: 'correct the frontend\'s "native" entry in pikku.config.json',
    }))
  }

  const configText = await readText(join(spec.dir, 'tauri.conf.json'))
  if (configText === undefined) {
    return [
      {
        level: 'error',
        message: `no native project at ${spec.dir}`,
        fix: `pikku app native init ${spec.name}`,
      },
    ]
  }

  const problems: NativeProblem[] = []
  const outOfDate = (message: string) =>
    problems.push({ level: 'error', message, fix: 'upgrade' })

  const config = JSON.parse(configText) as TauriConfig
  const expected = applyOwnedConfig(config, spec)
  for (const key of ['identifier', 'productName'] as const) {
    if (config[key] !== expected[key]) {
      outOfDate(
        `tauri.conf.json ${key} is ${JSON.stringify(config[key])}, the config says ${JSON.stringify(expected[key])}`
      )
    }
  }
  if (config.build?.frontendDist !== expected.build?.frontendDist) {
    outOfDate(
      `tauri.conf.json build.frontendDist is ${JSON.stringify(config.build?.frontendDist)}, expected ${JSON.stringify(expected.build?.frontendDist)}`
    )
  }
  if (
    JSON.stringify(config.bundle?.externalBin) !==
    JSON.stringify(expected.bundle?.externalBin)
  ) {
    outOfDate('tauri.conf.json bundle.externalBin does not match bundleServer')
  }

  const cargoText = await readText(join(spec.dir, 'Cargo.toml'))
  const cargo =
    cargoText === undefined ? undefined : syncCargoToml(cargoText, spec)
  if (cargo === undefined) {
    problems.push({
      level: 'error',
      message: `Cargo.toml is missing pikku's "${PLUGINS_START}" or "${MOBILE_PLUGINS_START}" markers`,
      fix: 'put the markers back around the tauri-plugin-* lines pikku manages',
    })
  } else if (cargo !== cargoText) {
    outOfDate('Cargo.toml plugin dependencies do not match native.plugins')
  }

  for (const [path, content] of Object.entries(renderOwnedFiles(spec))) {
    const current = await readText(join(spec.dir, path))
    if (content === undefined ? current !== undefined : current !== content) {
      outOfDate(`${path} is not what pikku would write for this config`)
    }
  }

  const lib = (await readText(join(spec.dir, 'src/lib.rs'))) ?? ''
  if (!/\bmod\s+pikku\s*;/.test(lib) || !lib.includes('pikku::plugins(')) {
    problems.push({
      level: 'error',
      message:
        'src/lib.rs does not call pikku::plugins, so no plugin in native.plugins is initialised',
      fix: 'add `mod pikku;` and pass the builder through `pikku::plugins(builder)` in run()',
    })
  }
  const spawnsSidecar = lib.includes('.sidecar(')
  if (spec.mode.kind === 'sidecar' && !spawnsSidecar) {
    problems.push({
      level: 'error',
      message:
        'bundleServer is set, but src/lib.rs never spawns the sidecar — it was written for a bundled or remote UI',
      fix: REINIT,
    })
  } else if (spec.mode.kind !== 'sidecar' && spawnsSidecar) {
    problems.push({
      level: 'error',
      message:
        'src/lib.rs spawns a sidecar, but bundleServer is not set, so none will be shipped',
      fix: REINIT,
    })
  }

  if (spec.platforms.includes('ios')) {
    const needed = iosUsageDescriptions(resolveNativeApis(spec.plugins))
    const plist = (await readText(join(spec.dir, 'Info.ios.plist'))) ?? ''
    const missing = Object.keys(needed).filter(
      (key) => !plist.includes(`<key>${key}</key>`)
    )
    if (missing.length > 0) {
      problems.push({
        level: 'error',
        message: `Info.ios.plist lacks ${missing.join(', ')} — iOS terminates the app the first time the plugin is used`,
        fix: `add ${missing.map((key) => `<key>${key}</key>`).join(', ')} to Info.ios.plist, each with the reason shown to the person asked`,
      })
    }
  }

  const gradle = await readText(
    join(spec.dir, 'gen/android/app/build.gradle.kts')
  )
  const applicationId = gradle
    ? /applicationId\s*=\s*"([^"]+)"/.exec(gradle)?.[1]
    : undefined
  if (applicationId && applicationId !== spec.identifier) {
    problems.push({
      level: 'error',
      message: `gen/android was generated for ${applicationId}, not ${spec.identifier}`,
      fix: 'delete gen/android and re-run `tauri android init`',
    })
  }

  if (
    spec.mode.kind === 'bundle' &&
    options.distDir &&
    !(await exists(join(options.distDir, 'index.html')))
  ) {
    problems.push({
      level: 'warning',
      message: `${options.distDir} holds no built frontend yet, so \`tauri build\` has nothing to package`,
      fix: 'build the frontend first — pikku never builds it',
    })
  }

  return problems
}

/**
 * Install a compiled pikku server into a native project as its sidecar.
 *
 * Build output rather than source: always replaced, named for the target triple
 * Tauri appends when it resolves `externalBin`, and gitignored.
 */
export const installSidecar = async (options: {
  dir: string
  binaryPath: string
  targetTriple: string
}): Promise<{ fileName: string; path: string }> => {
  const fileName = sidecarFileName(SIDECAR_NAME, options.targetTriple)
  const target = join(options.dir, 'binaries', fileName)
  await writeText(target, await readFile(options.binaryPath))
  await chmod(target, 0o755)
  return { fileName, path: target }
}

/** What a frontend's `package.json` needs to drive and call its native app. */
export const nativePackageJson = (
  plugins: readonly string[]
): {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  scripts: Record<string, string>
} => ({
  dependencies: Object.fromEntries([
    ['@tauri-apps/api', '^2'],
    ...resolveNativeApis(plugins).map((api) => [api.jsPackage, '^2']),
  ]),
  devDependencies: { '@tauri-apps/cli': '^2' },
  scripts: { tauri: 'tauri' },
})
