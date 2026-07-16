import { classifyExpression, type ExprContext } from './expressions.js'
import { untranslatableReason } from './code-translate.js'

/** Top-level Set/Edit-Fields parameters that are node config, never fields. */
const SET_CONFIG_KEYS = new Set([
  'mode',
  'options',
  'assignments',
  'values',
  'include',
  'includeOtherFields',
  'keepOnlySet',
  'duplicateItem',
])

/**
 * Extract a Set / Edit Fields node's assignments as a flat `{ field, value }`
 * list, normalizing across the node's format versions:
 *  - v3.4 "Edit Fields (Set)": `parameters.assignments.assignments[]` ({ name, value })
 *  - v2 "Set": `parameters.values.{string,number,boolean,…}[]` ({ name, value })
 *  - simplified/flat: each remaining top-level parameter key is a field
 */
export function setAssignments(
  parameters: Record<string, unknown>
): { field: string; value: unknown }[] {
  const container = parameters.assignments as
    | { assignments?: unknown }
    | undefined
  if (container && Array.isArray(container.assignments)) {
    return container.assignments
      .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
      .map((a) => ({ field: String(a.name ?? ''), value: a.value }))
      .filter((a) => a.field)
  }

  const values = parameters.values
  if (values && typeof values === 'object') {
    const out: { field: string; value: unknown }[] = []
    for (const group of Object.values(values as Record<string, unknown>)) {
      if (!Array.isArray(group)) continue
      for (const entry of group) {
        if (entry && typeof entry === 'object' && 'name' in entry) {
          const e = entry as Record<string, unknown>
          out.push({ field: String(e.name ?? ''), value: e.value })
        }
      }
    }
    if (out.length > 0) return out.filter((a) => a.field)
  }

  return Object.entries(parameters)
    .filter(([key]) => !SET_CONFIG_KEYS.has(key))
    .map(([field, value]) => ({ field, value }))
}

const BLOCK = /\{\{([\s\S]*?)\}\}/g

/** Whether an assignment value is one the expression classifier can't lower. */
const EMPTY_CTX: ExprContext = { nameToNodeId: {} }

/** Lower one Set assignment value to a JavaScript expression for the shim. */
function setValueToJs(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('=')) {
    return JSON.stringify(value)
  }
  const body = value.slice(1)
  const blocks: Array<{ index: number; length: number; content: string }> = []
  let m: RegExpExecArray | null
  BLOCK.lastIndex = 0
  while ((m = BLOCK.exec(body)) !== null) {
    blocks.push({ index: m.index, length: m[0].length, content: m[1] ?? '' })
  }

  if (blocks.length === 0) return JSON.stringify(body)

  // A single block spanning the whole value is a raw expression (keep its type —
  // `$json.a * 1.2` must stay a number, not be coerced to a string).
  if (
    blocks.length === 1 &&
    blocks[0]!.index === 0 &&
    blocks[0]!.length === body.length
  ) {
    return blocks[0]!.content.trim()
  }

  // Literal text interpolating one or more expressions → a JS template literal.
  const esc = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
  let out = '`'
  let cursor = 0
  for (const block of blocks) {
    out += esc(body.slice(cursor, block.index))
    out += `\${${block.content.trim()}}`
    cursor = block.index + block.length
  }
  out += esc(body.slice(cursor))
  return out + '`'
}

/**
 * A Set / Edit Fields node whose assignments are all literals, pure refs, or
 * templates stays a declarative `graph:editFields` call. If ANY assignment is a
 * value the expression classifier can't lower (arithmetic, method chains,
 * `new Date()`, `$env`, …), the whole node is instead emitted as a generated
 * function that returns its computed field object — run through the same
 * translation path as a Code node. Returns that function body, or null when the
 * node has no such transform (stays editFields).
 */
export function computedSetSource(
  parameters: Record<string, unknown>
): string | null {
  const assignments = setAssignments(parameters)
  if (assignments.length === 0) return null

  const hasTransform = assignments.some(
    (a) => classifyExpression(a.value, EMPTY_CTX).kind === 'transform'
  )
  if (!hasTransform) return null

  const fields = assignments.map(
    (a) => `  ${JSON.stringify(a.field)}: ${setValueToJs(a.value)},`
  )
  const source = `return {\n${fields.join('\n')}\n}`

  // Only functionize when the synthesized body would actually translate — a
  // value reaching outside its own input (`$vars`, `$secrets`, a dynamic node
  // ref, …) would bail to a throwing stub, which is worse than the declarative
  // editFields node that merely drops the one field. Leave those as editFields.
  return untranslatableReason(source) ? null : source
}
