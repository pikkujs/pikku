import { added, changed, dim, removed, table } from '../../fabric/lib/output.js'
import type { SurfaceChange } from '../../utils/surface-diff.js'
import type { SemverResult } from './semver.js'

const STATUS_COLOUR = {
  added,
  removed,
  modified: changed,
} as const

const verdictColour = (verdict: string) =>
  verdict === 'major'
    ? removed(verdict)
    : verdict === 'minor'
      ? changed(verdict)
      : dim(verdict)

export const renderSemver = (
  _services: unknown,
  result: SemverResult
): void => {
  if (result.mode === 'emit') {
    // No `--out`: the snapshot itself is the output, so it can be redirected.
    if (!result.written) {
      console.log(JSON.stringify(result.surface))
      return
    }
    const counts = [
      `${Object.keys(result.surface.functions).length} functions`,
      `${Object.keys(result.surface.schemas).length} schemas`,
    ].join(', ')
    console.log(`Surface snapshot written to ${result.written}  ${dim(counts)}`)
    return
  }

  const lines: string[] = ['']

  if (result.changes.length === 0) {
    lines.push(
      `${verdictColour('patch')}  no surface change against ${result.baseline}`,
      dim('   only internals moved'),
      ''
    )
    lines.push(dim(`   written to ${result.written}`))
    console.log(lines.join('\n'))
    return
  }

  const rows = result.changes.map((change: SurfaceChange) => [
    change.breaking ? removed('breaking') : dim('compatible'),
    change.kind,
    STATUS_COLOUR[change.status](change.status),
    change.id,
    change.reasons[0] ?? '',
  ])

  lines.push(table(['', 'Kind', 'Status', 'Id', 'Reason'], rows))

  // Only the first reason fits the table; a function whose schema moved in
  // several ways gets the rest listed underneath so nothing is lost to layout.
  for (const change of result.changes) {
    if (change.reasons.length <= 1) continue
    lines.push('', `${change.kind} ${change.id}`)
    for (const reason of change.reasons) {
      lines.push(dim(`   ${reason}`))
    }
  }

  const {
    breaking,
    added: addedCount,
    removed: removedCount,
    modified,
  } = result.summary
  const summary = [
    `${breaking} breaking`,
    `${addedCount} added`,
    `${removedCount} removed`,
    `${modified} modified`,
  ].join('  ')

  lines.push(
    '',
    '─'.repeat(40),
    `${verdictColour(result.verdict)} against ${result.baseline}`,
    dim(`   ${summary}`),
    dim(`   written to ${result.written}`)
  )

  console.log(lines.join('\n'))
}
