import { SEVERITIES, type Finding, type Severity } from './finding.js'
import { redact } from './redact.js'

/** The findings one gate reported in one attempt. */
export type GateFindings = { gate: string; findings: Finding[] }

export const atOrAbove = (severity: Severity, threshold: Severity) =>
  SEVERITIES.indexOf(severity) >= SEVERITIES.indexOf(threshold)

const location = ({ file, line }: Finding) =>
  file ? (line === undefined ? file : `${file}:${line}`) : undefined

/** One finding as one list item; a multi-line message stays inside the item. */
export const formatFinding = (finding: Finding): string => {
  const head = [location(finding), `[${finding.severity}]`, finding.rule]
    .filter(Boolean)
    .join(' ')
  return redact(
    `- ${head}: ${finding.message.trim().replace(/\r?\n/g, '\n  ')}`
  )
}

const omitted = (count: number) =>
  `\n… ${count} more finding(s) not shown; fix the ones above and run again.`

/**
 * The failing findings of every gate as one message for the builder, grouped by gate, at most
 * `maxChars` long. A finding that does not fit is left out whole and counted at the end.
 */
export const formatFeedback = (
  attempt: number,
  failing: GateFindings[],
  maxChars: number
): string => {
  const total = failing.reduce((sum, gate) => sum + gate.findings.length, 0)
  const reserve = omitted(total).length
  let out = `Attempt ${attempt} did not pass the gates. Fix these findings:\n`
  let shown = 0
  for (const { gate, findings } of failing) {
    const header = `\n${redact(gate)} (${findings.length}):\n`
    let headed = false
    for (const finding of findings) {
      const line = `${formatFinding(finding)}\n`
      const extra = (headed ? 0 : header.length) + line.length
      if (out.length + extra + reserve > maxChars) continue
      if (!headed) out += header
      headed = true
      out += line
      shown++
    }
  }
  if (shown < total) out += omitted(total - shown)
  return out.trimEnd()
}

const findingKey = ({ file, line, rule, severity, message }: Finding) =>
  JSON.stringify([file ?? null, line ?? null, rule ?? null, severity, message])

/** The failing set of an attempt, order-free, for spotting a builder that makes no progress. */
export const failingKey = (failing: GateFindings[]): string =>
  JSON.stringify(
    [
      ...new Set(failing.flatMap(({ findings }) => findings.map(findingKey))),
    ].sort()
  )
