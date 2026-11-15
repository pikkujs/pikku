import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { CloudPreconditionError, git } from '@pikku/cli/addon-support'

/**
 * `pikku changes next --prompt` hands out the intake route: file the request
 * and stop. It leaves this marker behind, and while it is fresh `claim`,
 * `done` and `merge` refuse unless the caller says it is a builder with
 * PIKKU_CHANGES_BUILDER=1. Unlike an env var on the filing session, the marker
 * is not something the filing agent's own shell carries, so `env -u` does not
 * remove it.
 *
 * It lives in the main checkout's `.pikku/` (git-ignored in every pikku
 * project), found through git's common dir so a worktree sees the same one.
 */
export const FILING_MARKER = 'changes-filing.json'
export const FILING_MARKER_TTL_MS = 2 * 60 * 60 * 1000

export type FilingMarker = { route: string; at: string }

export async function filingMarkerPath(
  cwd = process.cwd()
): Promise<string | null> {
  let common: string
  try {
    common = (await git(['rev-parse', '--git-common-dir'], cwd)).trim()
  } catch {
    return null
  }
  const dir = isAbsolute(common) ? common : join(cwd, common)
  return join(dirname(dir), '.pikku', FILING_MARKER)
}

export async function markFiling(
  route: string,
  cwd = process.cwd(),
  now = new Date()
): Promise<void> {
  const path = await filingMarkerPath(cwd)
  if (!path) return
  await mkdir(dirname(path), { recursive: true })
  const marker: FilingMarker = { route, at: now.toISOString() }
  await writeFile(path, JSON.stringify(marker, null, 2) + '\n')
}

/** The marker when one was written less than two hours ago, else null. */
export async function freshFilingMarker(
  cwd = process.cwd(),
  now = Date.now()
): Promise<FilingMarker | null> {
  const path = await filingMarkerPath(cwd)
  if (!path) return null
  let marker: FilingMarker
  try {
    marker = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
  const at = Date.parse(marker?.at)
  if (Number.isNaN(at) || now - at >= FILING_MARKER_TTL_MS || at > now + 60_000)
    return null
  return marker
}

const STOP = 'You are done: stop here. Another agent builds what you filed.'

/**
 * Claiming, finishing or merging is a builder's job. A session told only to
 * file (PIKKU_CHANGES_FILING_ONLY=1, or a fresh intake marker without
 * PIKKU_CHANGES_BUILDER=1) is refused before anything reaches the queue.
 */
export async function refuseWhileFiling(
  verb: string,
  cwd = process.cwd()
): Promise<void> {
  if (process.env.PIKKU_CHANGES_FILING_ONLY === '1')
    throw new CloudPreconditionError(
      `This session only files changes, so it cannot ${verb} one. ${STOP}`
    )
  if (process.env.PIKKU_CHANGES_BUILDER === '1') return
  const marker = await freshFilingMarker(cwd)
  if (marker)
    throw new CloudPreconditionError(
      `This project was handed the ${marker.route} route at ${new Date(marker.at).toISOString()}: that session only files changes, so it cannot ${verb} one. ${STOP}`
    )
}
