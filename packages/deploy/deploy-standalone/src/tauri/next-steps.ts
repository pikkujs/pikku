import type { NativeApi } from './native.js'

export type TauriNextStepsOptions = {
  /** Absolute path of the generated crate. */
  shellDir: string
  /** Whether a Rust toolchain answered when the triple was resolved. */
  hasRust: boolean
  /**
   * Set when the shell points at an already-deployed server. Only this mode can
   * be built for a phone, so it is the only one that gets mobile instructions.
   */
  remoteUrl?: string
  /** Native APIs the crate was generated with. */
  native?: readonly NativeApi[]
}

const PREREQUISITES = 'https://tauri.app/start/prerequisites/'

/**
 * What to say once the crate and its sidecar are on disk.
 *
 * Generation is pure Node — it writes files and copies a binary — so `--desktop`
 * succeeds perfectly well on a machine that cannot build the result. Saying so
 * here is the difference between a known prerequisite and a cargo error at the
 * point someone least expects one. That gap is widest on mobile, where the
 * toolchain is an Android SDK and NDK or an Xcode install rather than one
 * `rustup` command.
 */
export const renderTauriNextSteps = ({
  shellDir,
  hasRust,
  remoteUrl,
  native = [],
}: TauriNextStepsOptions): string[] => {
  const lines = [`  Next: cd ${shellDir} && npx tauri build`]
  if (!hasRust) {
    lines.push(
      `  That step needs a Rust toolchain, and none answered here — see ${PREREQUISITES}.`,
      '  The crate and its sidecar are complete, so another machine can build them as they are.'
    )
  }

  if (remoteUrl) {
    lines.push(
      '  For a phone, the same crate builds for both stores:',
      '    npx tauri android init && npx tauri android dev',
      '    npx tauri ios init && npx tauri ios dev',
      '  Each init writes a Gradle or Xcode project under gen/ — commit it; that is',
      '  where signing, the manifest and any app-link entry live.',
      `  Those steps need the Android SDK and NDK, or Xcode — see ${PREREQUISITES}.`
    )
  } else {
    lines.push(
      '  This shell bundles the server, so it is desktop-only: no mobile platform',
      '  permits spawning it. Re-run with --desktop-url <url> for a phone build.'
    )
  }

  if (native.length > 0) {
    lines.push(
      `  Native APIs: ${native.map((api) => api.name).join(', ')} — granted to ${
        remoteUrl ? new URL(remoteUrl).origin : 'the sidecar origin'
      }`,
      '  in capabilities/. Call them from the frontend with @tauri-apps/api, guarded',
      "  by a check for window.__TAURI_INTERNALS__ so the same build still runs in a browser."
    )
    if (Object.keys(Object.assign({}, ...native.map((a) => a.iosUsageDescriptions ?? {}))).length > 0) {
      lines.push(
        '  Info.ios.plist holds the consent strings iOS demands — reword them for your',
        '  app, and check they reached gen/apple after `tauri ios init`.'
      )
    }
    for (const api of native) {
      if (api.caveat) lines.push(`  ${api.name}: ${api.caveat}`)
    }
  }

  return lines
}
