import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { FindingPayload } from './finding.js'

/**
 * Findings that have not been sent. They are filed the moment something goes
 * wrong, in `.pikku/findings` at the checkout root: the one place a sandboxed
 * agent can always write, and one `pikku all` leaves alone and `.gitignore`
 * already covers.
 */
export function heldDir(root = checkoutRoot()): string {
  return (
    process.env.PIKKUSTUDIO_FINDINGS_DIR ?? join(root, '.pikku', 'findings')
  )
}

/**
 * Make the findings directory and keep git away from it, before anything is
 * written, so `git add -A` can never stage a finding that has not been agreed.
 */
async function ensureHeldDir(base: string, dir = base): Promise<void> {
  await mkdir(dir, { recursive: true })
  const ignore = join(base, '.gitignore')
  if (!existsSync(ignore)) {
    await writeFile(ignore, '*\n', { encoding: 'utf8', mode: 0o600 })
  }
}

/**
 * A run id that is the same every time for one checkout, for when `runs.json`
 * cannot be written: a later hand-over computes the same id and finds the file.
 */
export function fallbackRunId(root = checkoutRoot()): string {
  const key = process.env.PIKKUSTUDIO_FINDINGS_DIR ? root : 'checkout'
  const hex = createHash('sha256')
    .update(`${heldDir(root)}\0${key}`)
    .digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

const runsFile = (root: string) => join(heldDir(root), 'runs.json')

/** A directory outside any project, lifted out of `.git` if it is inside one. */
function outsideGit(dir: string): string {
  const parts = dir.split(sep)
  const gitAt = parts.indexOf('.git')
  return gitAt === -1 ? dir : parts.slice(0, gitAt).join(sep) || sep
}

/**
 * The checkout a finding came from: the nearest pikku.config.json, else cwd,
 * and never a directory inside `.git`.
 */
export function checkoutRoot(startDir = process.cwd()): string {
  let dir = resolve(startDir)
  while (true) {
    if (existsSync(join(dir, 'pikku.config.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return outsideGit(resolve(startDir))
    dir = parent
  }
}

/**
 * One id per checkout, made the first time it reports. Every finding carries
 * it, so cloud sees one build's findings together without learning anything
 * about the project.
 *
 * A folder inside the checkout has one run, whatever path the checkout is seen
 * at, because a sandbox mounts it somewhere else than the host does. Only a
 * shared `PIKKUSTUDIO_FINDINGS_DIR` needs the checkout's path to tell runs apart.
 */
export async function runIdFor(root = checkoutRoot()): Promise<string> {
  const file = runsFile(root)
  const key = process.env.PIKKUSTUDIO_FINDINGS_DIR ? root : 'checkout'
  let runs: Record<string, string> = {}
  if (existsSync(file)) {
    try {
      runs = JSON.parse(await readFile(file, 'utf8'))
    } catch {
      runs = {}
    }
  }
  if (runs[key]) return runs[key]
  runs[key] = randomUUID()
  await ensureHeldDir(heldDir(root))
  await writeFile(file, JSON.stringify(runs, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  })
  return runs[key]
}

export interface HeldFinding {
  file: string
  payload: FindingPayload
}

export async function holdFinding(payload: FindingPayload): Promise<void> {
  const dir = join(heldDir(), payload.runId)
  await ensureHeldDir(heldDir(), dir)
  const stamp = payload.reportedAt.replace(/[:.]/g, '-')
  // `reportedAt` is only millisecond-precise, and two findings filed in the
  // same millisecond tie on it. The monotonic clock breaks that tie in the
  // order they were held; the random suffix only keeps the name unique.
  const seq = process.hrtime.bigint().toString().padStart(20, '0')
  await writeFile(
    join(dir, `${stamp}-${seq}-${randomBytes(3).toString('hex')}.json`),
    JSON.stringify(payload, null, 2) + '\n',
    { encoding: 'utf8', mode: 0o600 }
  )
}

/** Oldest first. A file that no longer parses is skipped, not thrown for. */
export async function readHeld(runId: string): Promise<HeldFinding[]> {
  const dir = join(heldDir(), runId)
  if (!existsSync(dir)) return []
  const held: HeldFinding[] = []
  for (const name of await readdir(dir)) {
    if (!name.endsWith('.json')) continue
    const file = join(dir, name)
    try {
      held.push({ file, payload: JSON.parse(await readFile(file, 'utf8')) })
    } catch {
      continue
    }
  }
  return held.sort(
    (a, b) =>
      a.payload.reportedAt.localeCompare(b.payload.reportedAt) ||
      a.file.localeCompare(b.file)
  )
}

export async function dropHeld(held: HeldFinding[]): Promise<void> {
  for (const { file } of held) await rm(file, { force: true })
}
