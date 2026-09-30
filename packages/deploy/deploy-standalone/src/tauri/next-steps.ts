import { iosUsageDescriptions, resolveNativeApis } from './native.js'
import type { NativeMode, NativePlatform } from './project.js'

export type NativeNextStepsOptions = {
  /** The frontend's `cwd`, where `tauri` is run from. */
  cwd: string
  /** How the frontend's package manager runs a script — `bun run`, `npm run`. */
  run: string
  mode: NativeMode
  platforms: readonly NativePlatform[]
  plugins: readonly string[]
  /** Whether a Rust toolchain answered on this machine. */
  hasRust: boolean
}

const PREREQUISITES = 'https://tauri.app/start/prerequisites/'

/**
 * What to say once a native project is on disk.
 *
 * Generation is pure Node — it writes files — so it succeeds perfectly well on
 * a machine that cannot build the result. Saying so here is the difference
 * between a known prerequisite and a cargo error at the point someone least
 * expects one. That gap is widest on mobile, where the toolchain is an Android
 * SDK and NDK or an Xcode install rather than one `rustup` command.
 */
export const renderNativeNextSteps = ({
  cwd,
  run,
  mode,
  platforms,
  plugins,
  hasRust,
}: NativeNextStepsOptions): string[] => {
  const tauri = `${run} tauri`
  const lines = [`Next, from ${cwd} — install first, for @tauri-apps/cli:`]

  if (mode.kind === 'bundle') {
    lines.push(
      `  ${tauri} dev          the app, against your frontend's dev server`,
      `  ${tauri} build        after building the frontend into ${mode.frontendDist.replace(/^\.\.\//, '')}`
    )
  } else if (mode.kind === 'url') {
    lines.push(`  ${tauri} build        a window onto ${mode.url}`)
  } else {
    lines.push(
      '  pikku deploy apply --provider standalone --runtime bun',
      '                           compiles the server into src-tauri/binaries/',
      `  ${tauri} build        then packages it`
    )
  }

  lines.push(
    `  ${tauri} icon <png>   replaces the placeholder icon with your artwork, in every`,
    '                           size each platform asks for'
  )

  if (platforms.includes('android')) {
    lines.push(`  ${tauri} android init && ${tauri} android dev`)
  }
  if (platforms.includes('ios')) {
    lines.push(`  ${tauri} ios init && ${tauri} ios dev`)
  }
  if (platforms.some((p) => p !== 'desktop')) {
    lines.push(
      '  Each init writes a Gradle or Xcode project under src-tauri/gen/ — commit',
      '  it; signing, the manifest and any app-link entry live there.'
    )
  }

  if (!hasRust) {
    lines.push(
      `Building needs a Rust toolchain, and none answered here — see ${PREREQUISITES}.`,
      'The project is complete, so another machine can build it as it is.'
    )
  }

  if (mode.kind === 'bundle') {
    lines.push(
      'The UI is bundled, so its origin is the app’s own and your API is',
      'cross-origin: authenticate with a bearer token rather than a cookie, and',
      'allow the tauri://localhost and http://tauri.localhost origins in CORS.'
    )
  }

  const apis = resolveNativeApis(plugins)
  if (apis.length > 0) {
    lines.push(
      `Plugins: ${apis.map((api) => api.name).join(', ')}. Call them through their`,
      '@tauri-apps/plugin-* packages, guarded by a check for',
      'window.__TAURI_INTERNALS__ so the same build still runs in a browser.'
    )
    if (
      platforms.includes('ios') &&
      Object.keys(iosUsageDescriptions(apis)).length > 0
    ) {
      lines.push(
        'src-tauri/Info.ios.plist holds the consent strings iOS demands — reword',
        'them for your app.'
      )
    }
    for (const api of apis) {
      if (api.caveat) lines.push(`${api.name}: ${api.caveat}`)
    }
  }

  return lines
}
