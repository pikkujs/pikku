import { added, changed, dim, removed, table } from '../../utils/output.js'
import type { UpdateEntry, UpdateResult, UpdateStatus } from './update.js'

const STATUS_LABEL: Record<UpdateStatus, string> = {
  current: dim('current'),
  outdated: changed('outdated'),
  'stale-install': changed('stale install'),
  linked: dim('linked'),
  manual: dim('manual'),
  unresolved: removed('unresolved'),
}

/**
 * A linked package is a deliberate local checkout, not a decision waiting on
 * the user — so it is counted but never listed. Listing it buries the two rows
 * that matter under twenty that don't, which is what a monorepo run looks like.
 */
const QUIET: UpdateStatus[] = ['current', 'linked']

const isRemoteAddon = (entry: UpdateEntry) => entry.field === 'wireRemoteAddon'

/**
 * `pikku update` never writes source, so a versioned wireRemoteAddon that is
 * behind gets the exact edit to make instead.
 */
const remoteAddonEdit = (entry: UpdateEntry): string | null => {
  if (!isRemoteAddon(entry)) return null
  const at = `${entry.manifest}:${entry.line ?? '?'}`
  if (entry.status === 'outdated' && entry.target) {
    return `${at}  change '${entry.package}@${entry.range}' to '${entry.package}@${entry.target}'`
  }
  if (entry.status === 'stale-install') {
    return `${at}  run \`pikku all\` to sync '${entry.package}@${entry.range}'`
  }
  return null
}

export const renderUpdate = (
  _services: unknown,
  result: UpdateResult
): void => {
  const { entries, peers, summary, applied } = result

  if (entries.length === 0) {
    console.log(dim('No @pikku/* dependencies found.'))
    return
  }

  const multiManifest = new Set(entries.map((entry) => entry.manifest)).size > 1
  const interesting = entries.filter((entry) => !QUIET.includes(entry.status))
  const rows = (interesting.length > 0 ? interesting : entries).map((entry) => [
    entry.package,
    entry.range,
    entry.installed ?? dim('—'),
    entry.latest ?? dim('—'),
    entry.target
      ? applied && isRemoteAddon(entry)
        ? changed(entry.target)
        : added(entry.target)
      : dim('—'),
    STATUS_LABEL[entry.status],
    ...(multiManifest ? [dim(entry.manifest)] : []),
  ])

  console.log(
    table(
      [
        'Package',
        'Range',
        'Installed',
        'Latest',
        applied ? 'Written' : 'Update to',
        'Status',
        ...(multiManifest ? ['Manifest'] : []),
      ],
      rows
    )
  )

  for (const entry of entries) {
    if (
      entry.reason &&
      entry.status !== 'stale-install' &&
      !QUIET.includes(entry.status)
    ) {
      console.log(`${dim('•')} ${entry.package}: ${dim(entry.reason)}`)
    }
  }

  const edits = entries.map(remoteAddonEdit).filter((edit) => edit !== null)
  if (edits.length > 0) {
    console.log()
    console.log(changed('Remote addons to edit by hand:'))
    for (const edit of edits) console.log(`  ${edit}`)
  }

  if (peers.length > 0) {
    console.log()
    console.log(changed(`${peers.length} unsatisfied peer requirement(s):`))
    for (const peer of peers) {
      const has = peer.found
        ? `has ${peer.found}${peer.resolved ? dim(` (${peer.resolved})`) : ''}`
        : removed('not declared')
      console.log(
        `  ${peer.package} needs ${peer.peer}@${peer.required} — ${has}`
      )
    }
    if (!applied && peers.some((peer) => peer.found)) {
      console.log(
        dim('  run with --update-peers to write the ranges you already declare')
      )
    }
    if (peers.some((peer) => !peer.found)) {
      console.log(
        dim(
          '  a peer you do not declare is yours to add — update never adds one'
        )
      )
    }
  }

  console.log('─'.repeat(40))
  const counts = [
    dim(
      `${summary.checked} @pikku dependenc${summary.checked === 1 ? 'y' : 'ies'}`
    ),
  ]
  if (summary.outdated > 0) counts.push(changed(`${summary.outdated} outdated`))
  if (summary.staleInstall > 0)
    counts.push(changed(`${summary.staleInstall} stale install`))
  if (summary.linked > 0) counts.push(dim(`${summary.linked} linked`))
  if (summary.manual > 0) counts.push(dim(`${summary.manual} manual`))
  if (summary.unresolved > 0)
    counts.push(removed(`${summary.unresolved} unresolved`))
  console.log(counts.join('  '))

  if (applied) {
    if (result.written.length === 0) {
      console.log(
        added('✓') +
          '  ' +
          dim(
            edits.length > 0
              ? 'no package.json range to write'
              : 'nothing to write — already current'
          )
      )
    } else {
      console.log(
        added('✓') +
          `  ${result.written.length} file${result.written.length !== 1 ? 's' : ''} updated`
      )
      if (result.written.some((path) => path.endsWith('.json')))
        console.log(
          result.installed
            ? added('✓') +
                '  ' +
                dim(`${result.packageManager} install completed`)
            : dim(
                result.packageManager === 'unknown'
                  ? '   no lockfile found — install with your package manager'
                  : `   skipped install — run \`${result.packageManager} install\``
              )
        )
    }
    if (edits.length > 0) {
      console.log(
        dim(
          '   remote addon ranges are not rewritten — edit them by hand; the next `pikku all` resolves and locks them'
        )
      )
    }
  } else if (
    entries.some(
      (entry) =>
        !isRemoteAddon(entry) &&
        (entry.status === 'outdated' || entry.status === 'stale-install')
    )
  ) {
    console.log(dim('   run `pikku update --update` to apply'))
  } else if (edits.length === 0) {
    console.log(added('✓') + '  ' + dim('every @pikku dependency is current'))
  }
}
