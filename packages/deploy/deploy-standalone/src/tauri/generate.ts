import { createHash } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { renderPlaceholderIcon } from './icon.js'
import { renderMainRs } from './main-rs.js'
import { hostTargetTriple, sidecarFileName } from './target-triple.js'

/** Directory the shell crate is generated into, relative to the project root. */
export const TAURI_SHELL_DIR = 'src-tauri'

/**
 * Records the bytes this generator last wrote for each file, so a regenerate
 * can tell "unchanged since we wrote it" from "the user has taken this over".
 * Without it the only options are to clobber edits or to never update anything.
 */
const MANIFEST_FILE = '.pikku-shell.json'

const ICON_SIZE = 512

type Manifest = { version: number; files: Record<string, string> }

const hash = (content: Buffer | string): string =>
  createHash('sha256').update(content).digest('hex')

const readManifest = async (shellDir: string): Promise<Manifest> => {
  try {
    const parsed = JSON.parse(
      await readFile(join(shellDir, MANIFEST_FILE), 'utf-8')
    ) as Manifest
    if (parsed && typeof parsed === 'object' && parsed.files) return parsed
  } catch {
    // A missing or unreadable manifest means every existing file is the user's.
  }
  return { version: 1, files: {} }
}

/**
 * A crate name, a file name and a bundle identifier segment all reject the same
 * things, so one rule covers them.
 */
const slug = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * A reverse-DNS identifier for the bundle.
 *
 * A scoped package already names its org, so `@acme/shop` becomes
 * `com.acme.shop`. An unscoped name has no org to borrow, and `com.shop.app`
 * is not an option — macOS rejects an identifier ending in `.app`.
 */
export const tauriBundleIdentifier = (packageName: string): string => {
  const scoped = /^@([^/]+)\/(.+)$/.exec(packageName)
  if (scoped) {
    return `com.${slug(scoped[1]!)}.${slug(scoped[2]!)}`
  }
  return `com.${slug(packageName)}.desktop`
}

export type GenerateTauriShellOptions = {
  /** Project root. The crate is written to `<projectDir>/src-tauri`. */
  projectDir: string
  /** Product name, and the `externalBin` base name of the sidecar. */
  appName: string
  /** Reverse-DNS bundle identifier. See {@link tauriBundleIdentifier}. */
  identifier: string
  version?: string
  windowTitle?: string
  width?: number
  height?: number
  /** The compiled pikku binary to install as the sidecar. */
  binaryPath?: string
  /** Defaults to the host triple, via `rustc -vV` when available. */
  targetTriple?: string
  /**
   * An already-running server to open the window against, instead of shipping
   * one. The shell then bundles nothing: no sidecar, no binary, no supervision.
   */
  remoteUrl?: string
}

export type GenerateTauriShellResult = {
  /** Absolute path of the generated crate. */
  dir: string
  /** Files written this run, relative to `dir`. */
  written: string[]
  /** Files left alone because the user has edited them, relative to `dir`. */
  preserved: string[]
  targetTriple: string
  sidecar?: { fileName: string; path: string }
}

const renderConfig = (options: {
  appName: string
  identifier: string
  version: string
  windowTitle: string
  width: number
  height: number
  remoteUrl?: string
}): string =>
  JSON.stringify(
    {
      $schema: 'https://schema.tauri.app/config/2',
      productName: options.appName,
      version: options.version,
      identifier: options.identifier,
      build: {
        // The real UI is served by the sidecar over HTTP; the window is pointed
        // at it from Rust once the port is known. Tauri still requires a
        // frontend directory to exist, so a placeholder page stands in.
        frontendDist: 'ui',
      },
      app: {
        // A sidecar's origin is not known until it reports its port, so its
        // window is built from Rust and this stays deliberately empty. A remote
        // url is known here, and a declared window is the whole program.
        windows: options.remoteUrl
          ? [
              {
                label: 'main',
                url: options.remoteUrl,
                title: options.windowTitle,
                width: options.width,
                height: options.height,
              },
            ]
          : [],
        security: { csp: null },
      },
      bundle: {
        active: true,
        targets: 'all',
        icon: ['icons/icon.png'],
        ...(options.remoteUrl
          ? {}
          : { externalBin: [`binaries/${options.appName}`] }),
      },
    },
    null,
    2
  ) + '\n'

const renderCargoToml = (options: {
  crateName: string
  version: string
  remoteUrl?: string
}): string =>
  `[package]
name = "${options.crateName}"
version = "${options.version}"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
${options.remoteUrl ? '' : 'tauri-plugin-shell = "2"\n'}tauri-plugin-single-instance = "2"

[profile.release]
panic = "abort"
codegen-units = 1
lto = true
strip = true
`

const PLACEHOLDER_UI = `<!doctype html>
<meta charset="utf-8" />
<title>Starting…</title>
<p>Starting…</p>
`

const CAPABILITIES = JSON.stringify(
  {
    $schema: '../gen/schemas/desktop-schema.json',
    identifier: 'default',
    description: 'Baseline permissions for the pikku desktop shell.',
    windows: ['main'],
    permissions: ['core:default'],
  },
  null,
  2
)

const GITIGNORE = `/target
/binaries
/gen
`

/**
 * A webview can only open an http(s) origin, and everything the shell exists to
 * preserve — first-party cookies, CORS, OAuth redirects — is keyed on it. A
 * `file:` or custom-scheme url would build fine and then fail at runtime.
 */
const normalizeRemoteUrl = (raw: string): string => {
  const trimmed = raw.trim()
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error(`"${raw}" is not a url the desktop shell could open.`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `The desktop shell opens an http or https url; "${raw}" is ${parsed.protocol.replace(':', '')}.`
    )
  }
  return trimmed
}

export const generateTauriShell = async (
  options: GenerateTauriShellOptions
): Promise<GenerateTauriShellResult> => {
  const appName = options.appName
  if (!appName || slug(appName) !== appName) {
    throw new Error(
      `"${appName}" is not a usable app name for a Tauri shell — use lowercase letters, digits and dashes (got the slug "${slug(appName)}").`
    )
  }

  const remoteUrl = options.remoteUrl
    ? normalizeRemoteUrl(options.remoteUrl)
    : undefined
  if (remoteUrl && options.binaryPath) {
    throw new Error(
      'A remote desktop shell runs no server of its own, so there is no sidecar to install the binary as. Drop either the url or the binary.'
    )
  }

  const version = options.version ?? '0.1.0'
  const windowTitle = options.windowTitle ?? appName
  const width = options.width ?? 1200
  const height = options.height ?? 800
  const targetTriple = options.targetTriple ?? hostTargetTriple()
  const shellDir = join(options.projectDir, TAURI_SHELL_DIR)

  const files: Array<[string, Buffer | string]> = [
    [
      'tauri.conf.json',
      renderConfig({
        appName,
        identifier: options.identifier,
        version,
        windowTitle,
        width,
        height,
        remoteUrl,
      }),
    ],
    [
      'Cargo.toml',
      renderCargoToml({ crateName: `${appName}-shell`, version, remoteUrl }),
    ],
    ['build.rs', 'fn main() {\n    tauri_build::build()\n}\n'],
    [
      'src/main.rs',
      renderMainRs(
        remoteUrl
          ? { remoteUrl, windowTitle, width, height }
          : { sidecarName: appName, windowTitle, width, height }
      ),
    ],
    ['ui/index.html', PLACEHOLDER_UI],
    ['capabilities/default.json', CAPABILITIES],
    ['icons/icon.png', renderPlaceholderIcon(ICON_SIZE)],
    ['.gitignore', GITIGNORE],
  ]

  const manifest = await readManifest(shellDir)
  const written: string[] = []
  const preserved: string[] = []

  for (const [relativePath, content] of files) {
    const target = join(shellDir, relativePath)
    const nextHash = hash(content)

    let existing: Buffer | undefined
    try {
      existing = await readFile(target)
    } catch {
      existing = undefined
    }

    if (existing) {
      const currentHash = hash(existing)
      if (currentHash === nextHash) {
        manifest.files[relativePath] = nextHash
        continue
      }
      if (manifest.files[relativePath] !== currentHash) {
        preserved.push(relativePath)
        continue
      }
    }

    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content)
    manifest.files[relativePath] = nextHash
    written.push(relativePath)
  }

  let sidecar: GenerateTauriShellResult['sidecar']
  if (options.binaryPath) {
    // Build output rather than source: always replaced, never diffed against
    // the manifest, and gitignored.
    const binary = await readFile(options.binaryPath)
    const fileName = sidecarFileName(appName, targetTriple)
    const target = join(shellDir, 'binaries', fileName)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, binary)
    await chmod(target, 0o755)
    sidecar = { fileName, path: target }
  }

  await mkdir(shellDir, { recursive: true })
  await writeFile(
    join(shellDir, MANIFEST_FILE),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf-8'
  )

  return { dir: shellDir, written, preserved, targetTriple, sidecar }
}
