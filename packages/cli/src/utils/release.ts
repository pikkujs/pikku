import type { Surface } from './surface.js'
import type { SurfaceChange, SurfaceChanges, Verdict } from './surface-diff.js'

export const SNAPSHOT_FILE = 'surface.pikku.json'
export const CHANGELOG_FILE = 'CHANGELOG.md'
export const CHANGELOG_TITLE = '# Changelog'

export interface ParsedVersion {
  major: number
  minor: number
  patch: number
}

export function parseVersion(version: string): ParsedVersion {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim())
  if (!match) {
    throw new Error(
      `package.json version '${version}' is not a plain MAJOR.MINOR.PATCH version.`
    )
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

/** Below 1.0 a breaking change is a minor; 1.0 is only reached by going live. */
export function bumpVersion(
  version: string,
  level: Verdict,
  goLive = false
): string {
  const v = parseVersion(version)
  if (goLive) {
    if (v.major > 0) {
      throw new Error(
        `Already live at ${version}; --go-live only moves 0.x to 1.0.0.`
      )
    }
    return '1.0.0'
  }
  if (level === 'major' && v.major > 0) return `${v.major + 1}.0.0`
  if (level !== 'patch') return `${v.major}.${v.minor + 1}.0`
  return `${v.major}.${v.minor}.${v.patch + 1}`
}

export interface Commit {
  sha: string
  subject: string
  trailers: Record<string, string[]>
}

export const COMMIT_FORMAT = '%H%x1f%s%x1f%(trailers:only,unfold)%x1d'

export function parseCommits(output: string): Commit[] {
  const commits: Commit[] = []
  for (const record of output.split('\x1d')) {
    const trimmed = record.replace(/^\s+/, '')
    if (!trimmed) continue
    const [sha = '', subject = '', trailerBlock = ''] = trimmed.split('\x1f')
    const trailers: Record<string, string[]> = {}
    for (const line of trailerBlock.split('\n')) {
      const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line.trim())
      if (!match) continue
      const key = match[1]!.toLowerCase()
      ;(trailers[key] ??= []).push(match[2]!.trim())
    }
    commits.push({ sha: sha.trim(), subject: subject.trim(), trailers })
  }
  return commits
}

const code = (value: string) => `\`${value}\``

function changeLine(change: SurfaceChange): string {
  return `- ${code(change.kind)} ${code(change.id)} — ${change.reasons.join('; ')}`
}

export interface ChangelogInput {
  version: string
  date: string
  changes: SurfaceChanges
  commits: Commit[]
}

export function renderChangelogSection(input: ChangelogInput): string {
  const { changes, commits } = input
  const lines: string[] = [`## ${input.version} (${input.date})`, '']

  const groups: Array<[string, SurfaceChange[]]> = [
    ['Breaking', changes.changes.filter((c) => c.breaking)],
    [
      'Added',
      changes.changes.filter((c) => !c.breaking && c.status === 'added'),
    ],
    [
      'Changed',
      changes.changes.filter((c) => !c.breaking && c.status !== 'added'),
    ],
  ]
  for (const [heading, entries] of groups) {
    if (entries.length === 0) continue
    lines.push(`### ${heading}`, '', ...entries.map(changeLine), '')
  }

  const notes = commits.flatMap((c) => c.trailers['release-note'] ?? [])
  if (notes.length > 0) {
    lines.push('### Notes', '', ...notes.map((n) => `- ${n}`), '')
  }

  if (changes.changes.length === 0 && notes.length === 0) {
    lines.push('Internal changes only, no changes to the API.', '')
  }

  return lines.join('\n')
}

export function prependChangelog(
  existing: string | null,
  section: string
): string {
  const body = (existing ?? '').replace(/^﻿/, '')
  if (body.startsWith(`${CHANGELOG_TITLE}\n`) || body === CHANGELOG_TITLE) {
    const rest = body.slice(CHANGELOG_TITLE.length).replace(/^\n+/, '')
    return `${CHANGELOG_TITLE}\n\n${section}${rest ? `\n${rest}` : ''}`
  }
  return `${CHANGELOG_TITLE}\n\n${section}${body ? `\n${body}` : ''}`
}

export function latestChangelogSection(changelog: string): string | null {
  const start = changelog.indexOf('\n## ')
  if (start === -1) return null
  const next = changelog.indexOf('\n## ', start + 1)
  return changelog.slice(start + 1, next === -1 ? undefined : next).trimEnd()
}

/** Rewrites only the `version` value so the file's formatting survives. */
export function setPackageVersion(
  packageJson: string,
  version: string
): string {
  const pattern = /("version"\s*:\s*")[^"]*(")/
  if (!pattern.test(packageJson)) {
    throw new Error('package.json has no "version" field to bump.')
  }
  return packageJson.replace(pattern, `$1${version}$2`)
}

export function readPackageVersion(packageJson: string): string {
  const parsed = JSON.parse(packageJson) as { version?: unknown }
  if (typeof parsed.version !== 'string') {
    throw new Error('package.json has no "version" field.')
  }
  return parsed.version
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/** No timestamp and sorted keys, so the same surface always writes the same bytes. */
export function serializeSnapshot(surface: Surface): string {
  const { generatedAt: _generatedAt, ...rest } = surface
  return JSON.stringify(sortKeys(rest), null, 2) + '\n'
}
