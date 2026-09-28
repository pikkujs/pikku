import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { PikkuError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku/function'
import {
  git,
  GitError,
  headSha,
  isAncestor,
  isWorkingTreeClean,
  resolveRef,
} from '../../fabric/lib/git.js'
import { loadManifest } from '../../utils/contract-versions.js'
import { loadSurface, readSurface, type Surface } from '../../utils/surface.js'
import {
  computeSurfaceDiff,
  type SurfaceChanges,
  type Verdict,
} from '../../utils/surface-diff.js'
import {
  bumpVersion,
  CHANGELOG_FILE,
  CHANGELOG_TITLE,
  COMMIT_FORMAT,
  latestChangelogSection,
  parseCommits,
  prependChangelog,
  readPackageVersion,
  renderChangelogSection,
  serializeSnapshot,
  setPackageVersion,
  SNAPSHOT_FILE,
} from '../../utils/release.js'

type ReleaseConfig = {
  rootDir: string
  outDir: string
  release?: {
    trunk?: string
    production?: string
    branch?: string
    remote?: string
  }
}

const FAIL_LEVELS = ['major', 'minor', 'patch'] as const
type FailLevel = (typeof FAIL_LEVELS)[number]
const SEVERITY: Record<FailLevel, number> = { patch: 0, minor: 1, major: 2 }

const BOT_IDENTITY = [
  '-c',
  'user.name=pikku release',
  '-c',
  'user.email=release@pikku.dev',
]

function settings(config: ReleaseConfig) {
  return {
    trunk: config.release?.trunk ?? 'staging',
    production: config.release?.production ?? 'main',
    branch: config.release?.branch ?? 'release/next',
    remote: config.release?.remote ?? 'origin',
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf-8')
}

async function currentSurface(config: ReleaseConfig): Promise<Surface> {
  const manifest = await loadManifest(
    join(config.rootDir, 'versions.pikku.json')
  )
  return readSurface(resolve(config.rootDir, config.outDir), manifest)
}

async function identityArgs(cwd: string): Promise<string[]> {
  try {
    await git(['config', 'user.email'], cwd)
    return []
  } catch {
    return BOT_IDENTITY
  }
}

async function remoteBranchSha(
  remote: string,
  branch: string,
  cwd: string
): Promise<string | null> {
  return resolveRef(`refs/remotes/${remote}/${branch}`, cwd)
}

async function fetchRemote(remote: string, cwd: string): Promise<void> {
  await git(['fetch', '--quiet', '--prune', '--tags', remote], cwd)
}

async function assertProductionBehindTrunk(
  s: ReturnType<typeof settings>,
  productionSha: string | null,
  trunkSha: string,
  cwd: string
): Promise<void> {
  if (!productionSha) return
  if (await isAncestor(productionSha, trunkSha, cwd)) return
  throw new PikkuError(
    `${s.remote}/${s.production} has commits ${s.remote}/${s.trunk} does not. Merge ${s.production} into ${s.trunk} (with a merge commit, not a squash) before releasing.`
  )
}

export type ReleaseDiffInput = {
  against?: string
  out?: string
  failOn?: string
}
export type ReleaseDiffResult = {
  mode: 'compare'
  written: string
} & SurfaceChanges

export async function diffSurface(
  config: ReleaseConfig,
  input: ReleaseDiffInput
): Promise<ReleaseDiffResult> {
  const against = input.against ?? join(config.rootDir, SNAPSHOT_FILE)
  if (!input.against && !existsSync(against)) {
    throw new PikkuError(
      `No ${SNAPSHOT_FILE} to compare against. Run \`pikku release init\`, or pass --against <path|url>.`
    )
  }

  const [before, after] = await Promise.all([
    loadSurface(against),
    currentSurface(config),
  ])
  const changes = computeSurfaceDiff(
    before,
    after,
    input.against ?? SNAPSHOT_FILE
  )
  const out = input.out
    ? resolve(config.rootDir, input.out)
    : join(resolve(config.rootDir, config.outDir), 'changes.gen.json')
  writeJson(out, changes)

  const failOn = input.failOn as FailLevel | undefined
  if (failOn) {
    if (!FAIL_LEVELS.includes(failOn)) {
      throw new PikkuError(
        `--fail-on must be one of ${FAIL_LEVELS.join(', ')}, got '${failOn}'.`
      )
    }
    if (SEVERITY[changes.verdict] >= SEVERITY[failOn]) {
      throw new PikkuError(
        `Release is ${changes.verdict} against ${changes.baseline}, at or above --fail-on ${failOn}. See ${out}.`
      )
    }
  }

  return { mode: 'compare', written: out, ...changes }
}

export type ReleaseSnapshotInput = { out?: string }
export type ReleaseSnapshotResult = {
  mode: 'emit'
  surface: Surface
  written: string | null
}

export async function snapshotSurface(
  config: ReleaseConfig,
  input: ReleaseSnapshotInput
): Promise<ReleaseSnapshotResult> {
  const surface = await currentSurface(config)
  const out = input.out ? resolve(config.rootDir, input.out) : null
  if (out) {
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, serializeSnapshot(surface), 'utf-8')
  }
  return { mode: 'emit', surface, written: out }
}

export const pikkuReleaseDiff = pikkuSessionlessFunc<
  ReleaseDiffInput,
  ReleaseDiffResult
>({
  func: async ({ config }, input) => diffSurface(config, input ?? {}),
})

export const pikkuReleaseSnapshot = pikkuSessionlessFunc<
  ReleaseSnapshotInput,
  ReleaseSnapshotResult
>({
  func: async ({ config }, input) => snapshotSurface(config, input ?? {}),
})

export type ReleaseInitInput = { force?: boolean }
export type ReleaseInitResult = {
  version: string
  written: string[]
  skipped: string[]
}

export const pikkuReleaseInit = pikkuSessionlessFunc<
  ReleaseInitInput,
  ReleaseInitResult
>({
  func: async ({ config }, input) => {
    const packagePath = join(config.rootDir, 'package.json')
    if (!existsSync(packagePath)) {
      throw new PikkuError(`No package.json in ${config.rootDir}.`)
    }
    const version = readPackageVersion(readFileSync(packagePath, 'utf-8'))
    bumpVersion(version, 'patch')

    const written: string[] = []
    const skipped: string[] = []

    const snapshotPath = join(config.rootDir, SNAPSHOT_FILE)
    if (existsSync(snapshotPath) && !input?.force) {
      skipped.push(SNAPSHOT_FILE)
    } else {
      await snapshotSurface(config, { out: snapshotPath })
      written.push(SNAPSHOT_FILE)
    }

    const changelogPath = join(config.rootDir, CHANGELOG_FILE)
    if (existsSync(changelogPath)) {
      skipped.push(CHANGELOG_FILE)
    } else {
      writeFileSync(changelogPath, `${CHANGELOG_TITLE}\n`, 'utf-8')
      written.push(CHANGELOG_FILE)
    }

    return { version, written, skipped }
  },
})

export type ReleasePrepareInput = { dryRun?: boolean }
export type ReleasePrepareResult =
  | { status: 'nothing'; trunk: string; trunkSha: string }
  | {
      status: 'prepared' | 'dry-run'
      branch: string
      trunk: string
      trunkSha: string
      sha: string | null
      previousVersion: string
      version: string
      level: Verdict
      surface: SurfaceChanges
      commits: number
      changelog: string
    }

export const pikkuReleasePrepare = pikkuSessionlessFunc<
  ReleasePrepareInput,
  ReleasePrepareResult
>({
  func: async ({ config }, input) => {
    const s = settings(config)
    const cwd = config.rootDir

    await fetchRemote(s.remote, cwd)
    const trunkSha = await remoteBranchSha(s.remote, s.trunk, cwd)
    if (!trunkSha) {
      throw new PikkuError(`${s.remote}/${s.trunk} does not exist.`)
    }
    if ((await headSha(cwd)) !== trunkSha) {
      throw new PikkuError(
        `HEAD is not ${s.remote}/${s.trunk}. Check out ${s.trunk} at ${trunkSha.slice(0, 7)} and run \`pikku all\` before preparing a release.`
      )
    }
    if (!(await isWorkingTreeClean(cwd))) {
      throw new PikkuError('The working tree has uncommitted changes.')
    }

    const productionSha = await remoteBranchSha(s.remote, s.production, cwd)
    await assertProductionBehindTrunk(s, productionSha, trunkSha, cwd)

    const range = productionSha ? `${productionSha}..${trunkSha}` : trunkSha
    const commits = parseCommits(
      await git(['log', '--no-merges', `--format=${COMMIT_FORMAT}`, range], cwd)
    )
    if (commits.length === 0) {
      return { status: 'nothing', trunk: s.trunk, trunkSha }
    }

    const snapshotPath = join(cwd, SNAPSHOT_FILE)
    if (!existsSync(snapshotPath)) {
      throw new PikkuError(
        `No ${SNAPSHOT_FILE} on ${s.trunk}. Run \`pikku release init\` and commit what it writes.`
      )
    }
    const [before, after] = await Promise.all([
      loadSurface(snapshotPath),
      currentSurface(config),
    ])
    const surface = computeSurfaceDiff(before, after, SNAPSHOT_FILE)

    const packagePath = join(cwd, 'package.json')
    const packageJson = readFileSync(packagePath, 'utf-8')
    const previousVersion = readPackageVersion(packageJson)
    const level = surface.verdict
    const version = bumpVersion(previousVersion, level)
    const changelog = renderChangelogSection({
      version,
      date: new Date().toISOString().slice(0, 10),
      changes: surface,
      commits,
    })

    const base = {
      branch: s.branch,
      trunk: s.trunk,
      trunkSha,
      previousVersion,
      version,
      level,
      surface,
      commits: commits.length,
      changelog,
    }
    if (input?.dryRun) return { status: 'dry-run', sha: null, ...base }

    const changelogPath = join(cwd, CHANGELOG_FILE)
    writeFileSync(packagePath, setPackageVersion(packageJson, version), 'utf-8')
    writeFileSync(
      changelogPath,
      prependChangelog(
        existsSync(changelogPath) ? readFileSync(changelogPath, 'utf-8') : null,
        changelog
      ),
      'utf-8'
    )
    writeFileSync(snapshotPath, serializeSnapshot(after), 'utf-8')

    await git(['checkout', '--quiet', '--detach'], cwd)
    await git(['add', '--', 'package.json', CHANGELOG_FILE, SNAPSHOT_FILE], cwd)
    await git(
      [
        ...(await identityArgs(cwd)),
        'commit',
        '--quiet',
        '-m',
        `release: v${version}`,
      ],
      cwd
    )
    const sha = await headSha(cwd)
    await git(
      ['push', '--quiet', '--force', s.remote, `${sha}:refs/heads/${s.branch}`],
      cwd
    )

    const result: ReleasePrepareResult = { status: 'prepared', sha, ...base }
    writeJson(join(resolve(cwd, config.outDir), 'release.gen.json'), result)
    return result
  },
})

export type ReleasePublishInput = { dryRun?: boolean }
export type ReleasePublishResult = {
  status: 'published' | 'dry-run'
  version: string
  tag: string
  sha: string
  trunk: string
  production: string
  changelog: string | null
}

export const pikkuReleasePublish = pikkuSessionlessFunc<
  ReleasePublishInput,
  ReleasePublishResult
>({
  func: async ({ config }, input) => {
    const s = settings(config)
    const cwd = config.rootDir

    await fetchRemote(s.remote, cwd)
    const sha = await remoteBranchSha(s.remote, s.branch, cwd)
    if (!sha) {
      throw new PikkuError(
        `Nothing to publish: ${s.remote}/${s.branch} does not exist. Run \`pikku release prepare\` first.`
      )
    }
    const trunkSha = await remoteBranchSha(s.remote, s.trunk, cwd)
    if (!trunkSha) {
      throw new PikkuError(`${s.remote}/${s.trunk} does not exist.`)
    }
    if ((await git(['rev-parse', `${sha}^`], cwd)) !== trunkSha) {
      throw new PikkuError(
        `${s.branch} was prepared on an older ${s.trunk}. Run \`pikku release prepare\` again.`
      )
    }
    const productionSha = await remoteBranchSha(s.remote, s.production, cwd)
    await assertProductionBehindTrunk(s, productionSha, trunkSha, cwd)

    const prefix = await git(['rev-parse', '--show-prefix'], cwd)
    const version = readPackageVersion(
      await git(['show', `${sha}:${prefix}package.json`], cwd)
    )
    const tag = `v${version}`
    if (await git(['ls-remote', '--tags', s.remote, `refs/tags/${tag}`], cwd)) {
      throw new PikkuError(`${tag} is already tagged on ${s.remote}.`)
    }
    let changelog: string | null = null
    try {
      changelog = latestChangelogSection(
        await git(['show', `${sha}:${prefix}${CHANGELOG_FILE}`], cwd)
      )
    } catch (err) {
      if (!(err instanceof GitError)) throw err
    }

    const result: ReleasePublishResult = {
      status: input?.dryRun ? 'dry-run' : 'published',
      version,
      tag,
      sha,
      trunk: s.trunk,
      production: s.production,
      changelog,
    }
    if (input?.dryRun) return result

    await git(
      [
        ...(await identityArgs(cwd)),
        'tag',
        '--annotate',
        tag,
        sha,
        '-m',
        changelog ? `${tag}\n\n${changelog}` : tag,
      ],
      cwd
    )
    try {
      await git(
        [
          'push',
          '--quiet',
          '--atomic',
          `--force-with-lease=refs/heads/${s.branch}:${sha}`,
          s.remote,
          `${sha}:refs/heads/${s.trunk}`,
          `${sha}:refs/heads/${s.production}`,
          `refs/tags/${tag}`,
          `:refs/heads/${s.branch}`,
        ],
        cwd
      )
    } catch (err) {
      await git(['tag', '--delete', tag], cwd).catch(() => undefined)
      throw err
    }
    return result
  },
})
