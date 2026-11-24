import type { CompareRow } from '@pikku/cli/addon-support/pages'
import { WAIVABLE_BELOW } from '../../lib/page-reference.js'
import type { Finding } from '../finding.js'

/** What `pikku ui pages compare` writes to `<out>/report.json`, as far as the page gate reads it. */
export type CompareReport = {
  app?: string
  reference?: string
  gitSha: string | null
  dirty: boolean | null
  generatedAt: string
  rows: CompareRow[]
}

/** One page at one width the gate holds the changeset to: a screenshot of the original. */
export type PageNeed = { id: string; width: number; path: string }

export const PAGE_RULE = 'harness/page-compare'
/** A page that fails at a phone width (under WAIVABLE_BELOW): the one finding a person may waive. */
export const PHONE_RULE = 'harness/page-compare-phone'

const STATUSES = new Set(['compared', 'missing', 'error'])
const isNumberOrNull = (value: unknown) =>
  value === null || (typeof value === 'number' && Number.isFinite(value))

/** The report's text as a report, or an error saying what is wrong with it. */
export const readCompareReport = (text: string): CompareReport => {
  const report = JSON.parse(text) as Record<string, unknown>
  if (!report || typeof report !== 'object' || Array.isArray(report))
    throw new Error('report.json is not a JSON object')
  if (!Array.isArray(report.rows)) throw new Error('report.json has no rows')
  if (typeof report.generatedAt !== 'string')
    throw new Error('report.json has no generatedAt')
  for (const [i, value] of (report.rows as unknown[]).entries()) {
    const row = value as Record<string, unknown>
    if (
      !row ||
      typeof row.id !== 'string' ||
      typeof row.width !== 'number' ||
      typeof row.path !== 'string' ||
      !STATUSES.has(row.status as string) ||
      !isNumberOrNull(row.changedPercent) ||
      (row.status === 'compared' && typeof row.changedPercent !== 'number')
    )
      throw new Error(
        `report.json row ${i} is not a compare row: ${JSON.stringify(value).slice(0, 200)}`
      )
  }
  return {
    ...(typeof report.app === 'string' ? { app: report.app } : {}),
    ...(typeof report.reference === 'string'
      ? { reference: report.reference }
      : {}),
    gitSha: typeof report.gitSha === 'string' ? report.gitSha : null,
    dirty: typeof report.dirty === 'boolean' ? report.dirty : null,
    generatedAt: report.generatedAt,
    rows: report.rows as CompareRow[],
  }
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)

const heightLine = (row: CompareRow) =>
  row.ourHeight !== null && row.referenceHeight !== null
    ? ` Your page is ${row.ourHeight} px tall, the original ${row.referenceHeight} px (${signed(row.ourHeight - row.referenceHeight)} px).`
    : ''

const AFTER =
  'Fix what differs (the style lines first: they say what to change without opening the image), commit, then stop; the compare runs again after you stop.'

/**
 * The findings of one compare report for the pages the changeset is held to: one per page and width
 * that is over the threshold, missing or in error (high, PHONE_RULE at a phone width), and a report
 * taken with uncommitted changes (high). `diffDir` is where the diff images are, relative to the
 * worktree, so the builder is sent the image. A page and width the report has no row for throws:
 * the compare did not answer for it.
 */
export const pageFindings = ({
  report,
  needs,
  threshold,
  diffDir,
}: {
  report: CompareReport
  needs: PageNeed[]
  threshold: number
  diffDir: string
}): Finding[] => {
  const absent = needs.filter(
    (need) =>
      !report.rows.some((r) => r.id === need.id && r.width === need.width)
  )
  if (absent.length)
    throw new Error(
      `the compare report has no row for ${absent.map((n) => `${n.path} @${n.width}`).join(', ')}`
    )
  const findings: Finding[] = []
  if (report.dirty === true)
    findings.push({
      severity: 'high',
      rule: PAGE_RULE,
      message:
        'The pages were photographed with uncommitted changes in the frontend, so they do not show what was committed. Commit everything (leave nothing uncommitted), then stop; the compare runs again after you stop.',
    })
  for (const need of needs) {
    const row = report.rows.find(
      (r) => r.id === need.id && r.width === need.width
    )!
    const over =
      row.status !== 'compared' || (row.changedPercent ?? 100) > threshold
    if (!over) continue
    const at = `${need.path} at ${need.width} px`
    const rule = need.width < WAIVABLE_BELOW ? PHONE_RULE : PAGE_RULE
    if (row.status === 'missing') {
      findings.push({
        severity: 'high',
        rule,
        message: `MISSING ${at}: the compare found no page at ${row.path}${row.httpStatus === 404 ? ' (it answered 404)' : ''}. Build the page the original has at ${need.path}, commit, then stop; the compare runs again after you stop.`,
      })
      continue
    }
    if (row.status === 'error') {
      findings.push({
        severity: 'high',
        rule,
        message: `ERROR ${at}: the page could not be photographed: ${row.error ?? 'no screenshot'}. Make the page load without errors, commit, then stop; the compare runs again after you stop.`,
      })
      continue
    }
    const styles = (row.styles ?? []).slice(0, 4)
    const sections = (row.sections?.notes ?? []).slice(0, 4)
    const diff = `${diffDir.replace(/\/+$/, '')}/${need.id}-${need.width}.diff.png`
    findings.push({
      severity: 'high',
      rule,
      message: [
        `${at} differs from the original: ${row.changedPercent}% of its pixels changed, over the ${threshold}% limit.${heightLine(row)}`,
        ...(styles.length
          ? [
              'Style differences, worst first:',
              ...styles.map((s) => `  ${s.text}`),
            ]
          : []),
        ...(sections.length
          ? ['Section differences:', ...sections.map((note) => `  ${note}`)]
          : []),
        `Diff image (the original on the left, changed pixels in red in the middle, yours on the right): ${diff}`,
        AFTER,
      ].join('\n'),
    })
  }
  return findings
}
