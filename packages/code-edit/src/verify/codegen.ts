import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { VerifyFinding } from './types.js'

const BENIGN = /versions init|contract versioning/i
const LOCATED = /(\/?(?:[\w@.-]+\/)+[\w@.-]+\.tsx?)(?::(\d+))?/

/** The project's installed pikku CLI entry point, or null when it has none. */
export function resolvePikkuCli(rootDir: string): string | null {
  try {
    const bin = createRequire(join(rootDir, 'noop.cjs')).resolve('@pikku/cli')
    return existsSync(bin) ? bin : null
  } catch {
    return null
  }
}

type LogLine = { level?: string; message?: string; msg?: string; code?: string }

const SEVERITY: Record<string, VerifyFinding['severity'] | undefined> = {
  critical: 'error',
  error: 'error',
  warn: 'warn',
}

const CRASH_START = /^(?:\w*Error\b|\[PKU\d+\])/
const STACK_FRAME = /^\s*at\s+\S/
const RUN_FAILED = /^Workflow \S+ \(run [^)]*\) failed:?$/

const finding = (
  severity: VerifyFinding['severity'],
  raw: string,
  code?: string
): VerifyFinding => {
  const message = raw
    .replace(/^(?:Error:\s*)?\[(PKU\d+)\]\s*/, (_, c: string) => {
      code ??= c
      return ''
    })
    .replace(/\n\s*→\s*\S+\s*$/, '')
    .trim()
  const at = LOCATED.exec(message)
  return {
    id: code ?? 'codegen',
    severity,
    step: 'codegen',
    message,
    ...(code ? { code } : {}),
    ...(at ? { file: at[1] } : {}),
    ...(at?.[2] ? { line: Number(at[2]) } : {}),
  }
}

/** Coded diagnostics and errors from `pikku all --json` stderr, deduplicated across the CLI's repeated inspection passes; a crash printed as plain text replaces the bare "workflow failed" line. */
export function codegenFindings(output: string): VerifyFinding[] {
  const findings: VerifyFinding[] = []
  const seen = new Set<string>()
  const crash: string[] = []
  for (const raw of output.split('\n')) {
    const trimmed = raw.trim()
    if (!trimmed.startsWith('{')) {
      if (crash.length === 0 && !CRASH_START.test(trimmed)) continue
      if (trimmed && !STACK_FRAME.test(raw)) crash.push(raw.trimEnd())
      continue
    }
    let entry: LogLine
    try {
      entry = JSON.parse(trimmed) as LogLine
    } catch {
      continue
    }
    const severity = SEVERITY[entry.level ?? '']
    if (!severity) continue
    const found = finding(
      severity,
      entry.message ?? entry.msg ?? '',
      entry.code
    )
    if (!found.message || BENIGN.test(found.message)) continue
    const key = `${found.code ?? ''}|${found.message}`
    if (seen.has(key)) continue
    seen.add(key)
    findings.push(found)
  }
  if (crash.length === 0) return findings
  return [
    ...findings.filter((f) => !RUN_FAILED.test(f.message)),
    finding('error', crash.join('\n').slice(0, 4000)),
  ]
}
