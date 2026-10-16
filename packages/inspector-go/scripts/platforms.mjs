// The prebuilt targets, one npm package each under npm/<platform>-<arch>,
// esbuild style. `platform`/`arch` are Node's process.platform/process.arch
// (and the package's os/cpu fields); `goos`/`goarch` are what Go builds for.
//
// No musl variants: every binary is built with CGO_ENABLED=0, so the linux ones
// are static and run unchanged on glibc and musl (Alpine).
//
// src/binary.ts keeps its own copy of this list (it cannot import a script);
// binary.test.ts fails if the two, npm/ and optionalDependencies drift apart.
export const PLATFORMS = [
  { platform: 'darwin', arch: 'arm64', goos: 'darwin', goarch: 'arm64' },
  { platform: 'darwin', arch: 'x64', goos: 'darwin', goarch: 'amd64' },
  { platform: 'linux', arch: 'x64', goos: 'linux', goarch: 'amd64' },
  { platform: 'linux', arch: 'arm64', goos: 'linux', goarch: 'arm64' },
  { platform: 'win32', arch: 'x64', goos: 'windows', goarch: 'amd64' },
]

export const targetName = ({ platform, arch }) => `${platform}-${arch}`

export const executableName = (platform) =>
  platform === 'win32' ? 'pikku-inspect.exe' : 'pikku-inspect'
