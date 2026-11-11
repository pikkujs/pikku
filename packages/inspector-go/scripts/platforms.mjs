// The prebuilt targets. @pikku/inspector-go ships all of them, under
// prebuilt/<platform>-<arch>/, and picks the host's at runtime. `platform`/`arch`
// are Node's process.platform/process.arch; `goos`/`goarch` are what Go builds for.
//
// No musl variants: every binary is built with CGO_ENABLED=0, so the linux ones
// are static and run unchanged on glibc and musl (Alpine).
//
// src/binary.ts keeps its own copy of this list (it cannot import a script);
// binary.test.ts fails if the two drift apart.
export const PLATFORMS = [
  { platform: 'darwin', arch: 'arm64', goos: 'darwin', goarch: 'arm64' },
  { platform: 'linux', arch: 'x64', goos: 'linux', goarch: 'amd64' },
  { platform: 'linux', arch: 'arm64', goos: 'linux', goarch: 'arm64' },
  { platform: 'win32', arch: 'x64', goos: 'windows', goarch: 'amd64' },
]

export const targetName = ({ platform, arch }) => `${platform}-${arch}`

export const executableName = (platform) =>
  platform === 'win32' ? 'pikku-inspect.exe' : 'pikku-inspect'

// pikku-inspect-rs (the Rust inspector) ships beside pikku-inspect in the same
// prebuilt/<platform>-<arch>/ directories, for these targets only. It is built
// natively on a runner of each (the inspector-rs-build CI job), not
// cross-compiled, and links glibc dynamically, unlike the static Go binaries.
// src/binary.ts keeps its own copy (ENGINES.rs.platforms); binary.test.ts fails
// if the two drift apart.
export const RS_PLATFORMS = PLATFORMS.filter((p) =>
  ['darwin-arm64', 'linux-x64', 'linux-arm64'].includes(targetName(p))
)

export const rsExecutableName = () => 'pikku-inspect-rs'
