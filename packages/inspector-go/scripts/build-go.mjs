// Builds bin/pikku-inspect when a Go toolchain is on PATH. Without one the
// package still builds: the binary then comes from PIKKU_INSPECTOR_GO_BIN or
// the per-platform package.
import { spawnSync } from 'node:child_process'

const probe = spawnSync('go', ['version'], { stdio: 'ignore' })
if (probe.error || probe.status !== 0) {
  console.warn('@pikku/inspector-go: go not found, skipping bin/pikku-inspect')
  process.exit(0)
}
const build = spawnSync(
  'go',
  ['build', '-o', 'bin/pikku-inspect', './cmd/pikku-inspect'],
  { stdio: 'inherit' }
)
if (build.status !== 0) {
  console.warn(
    '@pikku/inspector-go: go build failed, bin/pikku-inspect not updated'
  )
}
