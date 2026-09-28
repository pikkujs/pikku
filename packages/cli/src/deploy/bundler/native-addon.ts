/**
 * Recognising native Node addons in a failed serverless bundle.
 *
 * A native addon cannot be bundled for a serverless runtime at all — there is
 * no `.node` loading on Workers — but that is never what the bundler reports.
 * The addon's JS wrapper imports `node:child_process`, `node:stream` and a
 * handful of helper packages, none of which resolve on a `neutral` platform, so
 * the failure arrives as a wall of unresolved builtins:
 *
 *     Could not resolve "node:util"          @ sharp/dist/constructor.mjs
 *     Could not resolve "node:child_process" @ sharp/dist/libvips.mjs
 *     Could not resolve "detect-libc"        @ sharp/dist/libvips.mjs
 *
 * Nothing there says "sharp", and nothing says "Workers". It reads as missing
 * polyfills, which sends people to `nodejs_compat` — a flag that cannot help,
 * because the blocker is the binary underneath. This module reads the owning
 * package back out of those paths and says what actually happened.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Platform-triple suffix used by the per-platform packages a prebuilt addon
 *  ships its binary in (`@img/sharp-linux-x64`, `@rollup/rollup-darwin-arm64`). */
const PLATFORM_PACKAGE =
  /-(darwin|linux|linuxmusl|win32|freebsd|android)-(x64|arm64|arm|ia32|wasm32)$/

const GYP_SCRIPT = /node-gyp|node-pre-gyp|prebuild-install|node-gyp-build/

interface PackageManifest {
  name?: string
  gypfile?: boolean
  binary?: unknown
  optionalDependencies?: Record<string, string>
  scripts?: Record<string, string>
}

/** Why we believe a package carries a native binary, in the words we report. */
const nativeEvidence = (pkg: PackageManifest): string | null => {
  if (pkg.gypfile === true) return 'builds a native addon with node-gyp'
  if (pkg.binary && typeof pkg.binary === 'object') {
    return 'declares a prebuilt native binary'
  }
  const platformPackages = Object.keys(pkg.optionalDependencies ?? {}).filter(
    (name) => PLATFORM_PACKAGE.test(name)
  )
  if (platformPackages.length > 0) {
    return `ships its binary in per-platform packages (${platformPackages[0]}, …)`
  }
  for (const stage of ['install', 'postinstall', 'preinstall'] as const) {
    const script = pkg.scripts?.[stage]
    if (script && GYP_SCRIPT.test(script)) {
      return `runs a native build on ${stage}`
    }
  }
  // `os` is deliberately NOT evidence. A pure-JS package may restrict itself to
  // one platform for reasons that have nothing to do with a binary, and
  // reporting it as a native addon tells the reader that Node compatibility
  // cannot save them when it might be exactly what they need.
  return null
}

/**
 * The only failure this module can diagnose: an import the bundler could not
 * resolve. A package named by a syntax error, a plugin crash or any other
 * compile failure is not evidence of a native addon, and replacing that error
 * with "it imports a native addon" sends the reader somewhere the fix is not.
 */
const UNRESOLVED_IMPORT = /could not resolve/i

/**
 * Every `node_modules/<pkg>` root mentioned by an unresolved-import line of a
 * bundler error, innermost wins so a package inside a content-addressed store
 * (`node_modules/.bun/sharp@1.2.3+hash/node_modules/sharp`) resolves to the
 * package rather than the store.
 */
const packageRootsIn = (message: string): Map<string, string> => {
  const roots = new Map<string, string>()
  const pattern =
    /((?:[^\s"'()]*\/)?node_modules\/(@[^/\s"']+\/[^/\s"']+|[^@/\s"'][^/\s"']*))(?=[/\s"']|$)/g
  for (const line of message.split('\n')) {
    if (!UNRESOLVED_IMPORT.test(line)) continue
    for (const match of line.matchAll(pattern)) {
      const [, root, name] = match
      if (!root || !name || name === '.bun' || name === '.pnpm') continue
      roots.set(name, root)
    }
  }
  return roots
}

export interface NativeAddonHit {
  packageName: string
  evidence: string
}

/**
 * Reads the packages named by the unresolved-import lines of a failed bundle's
 * error text and returns those that carry a native binary. Empty when the
 * failure was something else — the caller keeps the original message in that
 * case, because a guess dressed as a diagnosis is worse than the raw error.
 */
export const findNativeAddons = async (
  message: string
): Promise<NativeAddonHit[]> => {
  const hits: NativeAddonHit[] = []
  for (const [packageName, root] of packageRootsIn(message)) {
    let manifest: PackageManifest
    try {
      manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf-8'))
    } catch {
      // Not every path in an error message is a real package root — a stale
      // path, a stubbed module, a truncated line. Nothing to report for one we
      // cannot read.
      continue
    }
    const evidence = nativeEvidence(manifest)
    if (evidence) hits.push({ packageName, evidence })
  }
  return hits
}

/**
 * The message a serverless bundle should fail with when it pulled in a native
 * addon, replacing the unresolved-builtin wall with the package name, the
 * reason, and the two ways out.
 */
export const nativeAddonBundleError = (
  unitName: string,
  hits: NativeAddonHit[]
): string => {
  const listed = hits
    .map((hit) => `  - ${hit.packageName} — ${hit.evidence}`)
    .join('\n')
  return (
    `Unit "${unitName}" cannot be built for a serverless target: it imports a ` +
    `native Node addon, and serverless runtimes cannot load one.\n${listed}\n\n` +
    `The unresolved 'node:*' imports below are the addon's own wrapper failing ` +
    `to resolve; a Node-compatibility flag does not fix them, because the ` +
    `blocker is the binary underneath.\n\n` +
    `Move the code that needs it onto a container instead: declare the service ` +
    `that owns it in 'deploy.serverlessIncompatible' in pikku.config.json, or ` +
    `set 'deploy: "server"' on the function itself. Everything else stays ` +
    `serverless.`
  )
}
