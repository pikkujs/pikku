import { added, changed, dim, removed } from '../../fabric/lib/output.js'
import type {
  ReleaseInitResult,
  ReleasePrepareResult,
  ReleasePublishResult,
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
    result.level.level === 'major'
      ? removed(result.level.level)
      : result.level.level === 'minor'
        ? changed(result.level.level)
        : dim(result.level.level)
  const why = [
    result.level.source === 'trailer' ? 'raised by a Release: trailer' : null,
    result.level.preOneDowngrade ? 'breaking held to minor below 1.0' : null,
  ].filter(Boolean)
  const lines = [
    `v${result.previousVersion} → v${result.version}  ${level}${why.length ? dim(`  (${why.join(', ')})`) : ''}`,
    dim(
      `   ${result.surface.changes.length} surface changes, ${result.commits} commits on ${result.trunk}`
    ),
    '',
    result.changelog.trimEnd(),
    '',
    result.status === 'dry-run'
      ? dim('   dry run — nothing written or pushed')
      : dim(
          `   pushed ${result.branch} at ${result.sha?.slice(0, 7)}; run \`pikku release publish\` to ship it`
        ),
  ]
  console.log(lines.join('\n'))
}

export const renderReleasePublish = (
  _services: unknown,
  result: ReleasePublishResult
): void => {
  const verb = result.status === 'dry-run' ? 'Would publish' : 'Published'
  console.log(
    [
      `${verb} ${result.tag} at ${result.sha.slice(0, 7)}`,
      dim(
        result.status === 'dry-run'
          ? `   ${result.trunk} and ${result.production} would fast-forward`
          : `   ${result.trunk} and ${result.production} fast-forwarded, tag pushed`
      ),
    ].join('\n')
  )
}
