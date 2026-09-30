import { added, changed, dim, removed } from '../../fabric/lib/output.js'
import type {
  ReleaseInitResult,
  ReleasePrepareResult,
} from './release.js'

export const renderReleaseInit = (
  _services: unknown,
  result: ReleaseInitResult
): void => {
  const lines = [`Release baseline for v${result.version}`]
  for (const file of result.written) lines.push(added(`   wrote ${file}`))
  for (const file of result.skipped) lines.push(dim(`   kept ${file}`))
  if (result.written.length > 0) {
    lines.push(
      '',
      dim(`   commit ${result.written.join(' and ')} to your trunk branch`)
    )
  }
  console.log(lines.join('\n'))
}

export const renderReleasePrepare = (
  _services: unknown,
  result: ReleasePrepareResult
): void => {
  if (result.status === 'nothing') {
    console.log(
      `Nothing to release: ${result.trunk} (${result.trunkSha.slice(0, 7)}) is already live.`
    )
    return
  }
  const level =
    result.level === 'major'
      ? removed(result.level)
      : result.level === 'minor'
        ? changed(result.level)
        : dim(result.level)
  const lines = [
    `v${result.previousVersion} → v${result.version}  ${level}`,
    dim(
      `   ${result.surface.changes.length} surface changes, ${result.commits} commits on ${result.trunk}`
    ),
    '',
    result.changelog.trimEnd(),
    '',
    result.status === 'dry-run'
      ? dim('   dry run — nothing written')
      : dim(
          `   wrote ${result.files.join(', ')}; commit them on ${result.trunk} and fast-forward ${result.production} to ship`
        ),
  ]
  console.log(lines.join('\n'))
}
