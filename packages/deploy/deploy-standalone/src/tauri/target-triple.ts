/**
 * Rust target triples, and the file name Tauri's `externalBin` resolves a
 * sidecar by.
 *
 * Tauri appends the *compile* target's triple to every `externalBin` path and
 * looks the result up on disk, so a binary dropped in as plain `binaries/app`
 * is silently invisible to the bundler. This is the one detail that makes an
 * otherwise correct shell fail at build time with "binary not found".
 */

export type HostPlatform = NodeJS.Platform
export type HostArch = string

const TRIPLES: Record<string, string> = {
  'darwin:arm64': 'aarch64-apple-darwin',
  'darwin:x64': 'x86_64-apple-darwin',
  'linux:arm64': 'aarch64-unknown-linux-gnu',
  'linux:x64': 'x86_64-unknown-linux-gnu',
  'win32:arm64': 'aarch64-pc-windows-msvc',
  'win32:x64': 'x86_64-pc-windows-msvc',
}

/** Pull the `host:` line out of `rustc -vV` output. */
export const parseRustcHost = (output: string): string | undefined =>
  /^host:\s*(\S+)$/m.exec(output)?.[1]

export type HostTargetTripleOptions = {
  platform?: HostPlatform
  arch?: HostArch
  /** Raw `rustc -vV` output, when the toolchain was reachable. */
  rustcVersionVerbose?: string
}

/**
 * The triple the shell will be built for.
 *
 * `rustc -vV` wins when it is available: it is the toolchain that will link the
 * shell, and it knows things the Node platform pair cannot express — a musl
 * host, or a Node process running under Rosetta on an arm64 Mac.
 */
export const hostTargetTriple = (
  options: HostTargetTripleOptions = {}
): string => {
  const fromRustc = options.rustcVersionVerbose
    ? parseRustcHost(options.rustcVersionVerbose)
    : undefined
  if (fromRustc) return fromRustc

  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  const triple = TRIPLES[`${platform}:${arch}`]
  if (!triple) {
    throw new Error(
      `No known Rust target triple for ${platform}/${arch}. Install a Rust toolchain so \`rustc -vV\` can report its host, or pass the triple explicitly.`
    )
  }
  return triple
}

/** `binaries/<name>-<triple>[.exe]`, exactly as `externalBin` looks it up. */
export const sidecarFileName = (
  baseName: string,
  targetTriple: string
): string =>
  `${baseName}-${targetTriple}${targetTriple.includes('windows') ? '.exe' : ''}`
