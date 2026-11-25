import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PlannedChange } from './change-plan.js'
import { REFERENCES_DIR } from './page-reference.js'

/** A capture's summary of what the original relies on and does (`pikku ui pages capture`). */
type Behaviour = Record<string, unknown> & {
  outsideHosts?: Record<string, unknown>
  siblings?: Array<{ host?: string }>
}

/** The capture folder holding `behaviour.json`, or null when the project has none. */
export function captureOf(
  top: string
): { dir: string; behaviour: Behaviour } | null {
  const root = join(top, REFERENCES_DIR)
  let sites: string[] = []
  try {
    sites = readdirSync(root)
  } catch {
    return null
  }
  for (const site of sites) {
    const file = join(root, site, 'behaviour.json')
    if (!existsSync(file)) continue
    try {
      return {
        dir: join(root, site),
        behaviour: JSON.parse(readFileSync(file, 'utf8')),
      }
    } catch {
      return null
    }
  }
  return null
}

/** Whether a `behaviour:` key (`forms[1].fields`, `outsideHosts.<host>`) names something in the summary. */
function resolves(behaviour: Behaviour, key: string): boolean {
  if (key.startsWith('outsideHosts.'))
    return key.slice('outsideHosts.'.length) in (behaviour.outsideHosts ?? {})
  let at: unknown = behaviour
  for (const part of key.match(/[^.[\]]+|\[\d+\]/g) ?? []) {
    if (part.startsWith('[')) {
      const index = Number(part.slice(1, -1))
      if (!Array.isArray(at) || index >= at.length) return false
      at = at[index]
    } else if (at && typeof at === 'object' && part in at)
      at = (at as Record<string, unknown>)[part]
    else return false
  }
  return true
}

const CITATION = /\b(page|behaviour|note):([^\s,;)]+)/g
const PRIMARY = /\b(page|behaviour):|https?:\/\//

/**
 * The problems with a site plan's evidence, checked against the capture: every change ends with `Evidence:` lines;
 * every `page:<id>` is a captured page, every `behaviour:<key>` is in `behaviour.json`, every `note:<file>` is in
 * knowledge/site/; no line rests on a note alone; and every outside host and sibling app of the capture is named by
 * some change. None when the project has no capture.
 */
export function evidenceProblems(plan: PlannedChange[], top: string): string[] {
  const capture = captureOf(top)
  if (!capture) return []
  const { dir, behaviour } = capture
  const problems: string[] = []
  plan.forEach((change, index) => {
    const where = `change ${index + 1} ("${change.ref}")`
    if (
      change.specialist === 'artifacts' &&
      /\b(captur|reference)/i.test(`${change.title} ${change.body}`)
    )
      problems.push(
        `${where}: the capture is already in ${REFERENCES_DIR}; drop this change and put what the capture could not reach as an "Open question: ..." in the change that needs it.`
      )
    const at = change.body.search(/^Evidence:/m)
    if (at < 0) {
      problems.push(
        `${where}: no "Evidence:" lines; add one per feature with the captured source it rests on.`
      )
      return
    }
    const lines = change.body
      .slice(at)
      .split('\n')
      .filter((line) => line.trim().startsWith('-'))
    for (const line of lines) {
      if (/\bnote:/.test(line) && !PRIMARY.test(line))
        problems.push(
          `${where}: "${line.trim()}" rests on a note alone; cite the captured page, behaviour.json key or captured URL it comes from.`
        )
      for (const [, kind, raw] of line.matchAll(CITATION)) {
        const value = raw!.replace(/[.,:]+$/, '')
        const missing =
          kind === 'page'
            ? !existsSync(join(dir, `${value}.json`)) &&
              !existsSync(join(dir, `${value}.behaviour.json`))
            : kind === 'behaviour'
              ? !resolves(behaviour, value)
              : !existsSync(join(top, 'knowledge', 'site', value))
        if (missing)
          problems.push(
            `${where}: ${kind}:${value} is not in the capture${kind === 'note' ? ' (notes are named from knowledge/site/, e.g. note:index.md)' : ''}.`
          )
      }
    }
  })
  const text = plan.map((c) => `${c.title}\n${c.body}`).join('\n')
  const hosts = [
    ...Object.keys(behaviour.outsideHosts ?? {}),
    ...(behaviour.siblings ?? []).map((s) => s.host ?? ''),
  ].filter(Boolean)
  const unnamed = [...new Set(hosts)].filter((host) => !text.includes(host))
  if (unnamed.length)
    problems.push(
      `No change names these hosts of behaviour.json; say for each, in the change it concerns, whether it is replaced or kept and why: ${unnamed.join(', ')}.`
    )
  return problems
}
