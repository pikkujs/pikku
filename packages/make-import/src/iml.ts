/**
 * Make IML (the `{{ … }}` mapper language) → n8n expression syntax.
 *
 * This is a deliberate bridge, not a second classifier. `@pikku/n8n-import`'s
 * `classifyExpression` already lowers an expression string into the four tiers
 * the graph input mapper accepts (literal / ref / template / transform), and
 * `codegen` calls it internally on raw parameter values. Rather than fork that
 * pipeline, we rewrite Make's reference syntax into the n8n syntax it already
 * understands, and let it do the lowering.
 *
 *   Make                        n8n                                   → tier
 *   {{1.email}}                 ={{ $node["m1"].json.email }}         ref
 *   {{1.`0`}}                   ={{ $node["m1"].json["0"] }}          ref
 *   Hi {{1.name}}!              =Hi {{ $node["m1"].json.name }}!      template
 *   {{split(1.`1`; space)}}     ={{ split(1.`1`; space) }}            transform
 *   {{1.choices[].message}}     ={{ 1.choices[].message }}            transform
 *
 * Anything that isn't a pure module-field reference is passed through verbatim
 * inside the braces. `classifyExpression` fails to parse it as a ref and falls
 * back to `transform`, which is exactly the right outcome: it needs a generated
 * function, and the original IML is preserved for a human to read.
 */

/**
 * A pure Make reference: `<moduleId>.<path>` where each segment is a plain key
 * or a backtick-quoted key (`` `0` ``, `` `__ROW_NUMBER__` ``).
 *
 * Deliberately excluded — these are NOT pure refs and must stay transforms:
 *  - `[]`            array-iteration (`{{1.choices[].message.content}}`); the
 *                    graph has no ambient per-item semantics to lower it onto.
 *  - `func(...)`     IML function calls — the leading `\d+\.` guard rejects them.
 *  - `{{now}}`       bare keywords have no module id.
 */
const SEGMENT = String.raw`(?:[A-Za-z_$][\w$]*|\x60[^\x60]+\x60)`
const RE_PURE_REF = new RegExp(
  String.raw`^\s*(\d+)\.(${SEGMENT}(?:\.${SEGMENT})*)\s*$`
)

const BLOCK = /\{\{([\s\S]*?)\}\}/g

/** `` a.`0`.b `` → `.a["0"].b` — an n8n accessor tail. */
function toAccessor(path: string): string {
  const segments: string[] = []
  let buf = ''
  let inTick = false
  for (const ch of path) {
    if (ch === '`') {
      inTick = !inTick
      continue
    }
    if (ch === '.' && !inTick) {
      segments.push(buf)
      buf = ''
      continue
    }
    buf += ch
  }
  segments.push(buf)

  return segments
    .filter((s) => s.length > 0)
    .map((s) => (/^[A-Za-z_$][\w$]*$/.test(s) ? `.${s}` : `["${s}"]`))
    .join('')
}

/** Resolve one `{{ … }}` body to an n8n expression body, or null if not a pure ref. */
function bridgeBlock(body: string, idToName: Map<number, string>): string | null {
  const m = RE_PURE_REF.exec(body)
  if (!m) return null
  const id = Number(m[1])
  const name = idToName.get(id)
  // A ref to a module outside this flow (or a stale id) can't be resolved.
  if (!name) return null
  return `$node["${name}"].json${toAccessor(m[2]!)}`
}

/**
 * Rewrite a Make mapper value into an n8n expression string.
 *
 * Non-string values and strings with no `{{ … }}` are returned unchanged — they
 * are already literals, and `classifyExpression` treats any string without a
 * leading `=` as a literal.
 */
export function imlToN8n(value: unknown, idToName: Map<number, string>): unknown {
  if (typeof value !== 'string') return value
  if (!value.includes('{{')) return value

  let out = ''
  let cursor = 0
  let matched = false
  let match: RegExpExecArray | null
  BLOCK.lastIndex = 0
  while ((match = BLOCK.exec(value)) !== null) {
    matched = true
    out += value.slice(cursor, match.index)
    const bridged = bridgeBlock(match[1] ?? '', idToName)
    // Not a pure ref → keep the original IML so the generated transform function
    // shows what the author actually wrote.
    out += `{{ ${bridged ?? (match[1] ?? '').trim()} }}`
    cursor = match.index + match[0].length
  }
  if (!matched) return value
  out += value.slice(cursor)
  return `=${out}`
}

/**
 * Recursively bridge every string in a mapper.
 *
 * KNOWN GAP (v1): `codegen` classifies each parameter VALUE, so a ref nested
 * inside an array or object (`mapper.to = ["{{1.\`0\`}}"]`, common in Make and
 * rare in n8n) is bridged here but then classified as a literal — the ref is not
 * lowered to `ref(...)`. The harness reports these as `nested-ref` so the size of
 * the gap is measured rather than assumed.
 */
export function bridgeMapper(
  value: unknown,
  idToName: Map<number, string>
): unknown {
  if (Array.isArray(value)) return value.map((v) => bridgeMapper(v, idToName))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = bridgeMapper(v, idToName)
    }
    return out
  }
  return imlToN8n(value, idToName)
}

/**
 * Will every `{{ … }}` in this bridged value lower to a declarative ref?
 *
 * `bridgeBlock` rewrites a pure module-field reference to `$node["…"].json…` and
 * passes anything else through as raw IML. So a bridged block that does NOT start
 * with `$node[` is one `classifyExpression` will call a `transform` — it cannot
 * become a `ref`/`template`.
 *
 * This matters for FILTER OPERANDS specifically. A transform in a mapper field is
 * harmless: codegen drops the field and leaves a TODO. A transform in a filter
 * operand is not — `emitBranchInput` falls back to `left: undefined` and silently
 * emits a gate with the wrong truth table.
 */
export function isFullyBridged(value: unknown): boolean {
  if (typeof value !== 'string') return true
  if (!value.startsWith('=')) return true
  const blocks = value.matchAll(/\{\{([\s\S]*?)\}\}/g)
  for (const b of blocks) {
    if (!(b[1] ?? '').trim().startsWith('$node[')) return false
  }
  return true
}

/** Does this value contain an expression string anywhere inside it? */
function containsExpr(value: unknown): boolean {
  if (typeof value === 'string') return value.startsWith('=')
  if (Array.isArray(value)) return value.some(containsExpr)
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(containsExpr)
  }
  return false
}

/**
 * Does this bridged MAPPER hold a ref nested inside a container?
 *
 * The distinction that matters: a mapper's own field values are what codegen
 * classifies, so `{ to: "{{1.\`0\`}}" }` is an ordinary scalar ref and lowers
 * fine. Only a ref one level deeper — `{ to: ["{{1.\`0\`}}"] }` — needs codegen
 * to recurse into the container.
 *
 * Takes the whole mapper (not a single value): "nested" is defined relative to
 * the field value, so the depth origin has to be the mapper itself.
 */
export function hasNestedRef(mapper: unknown): boolean {
  if (!mapper || typeof mapper !== 'object') return false
  return Object.values(mapper as Record<string, unknown>).some(
    (fieldValue) => typeof fieldValue === 'object' && containsExpr(fieldValue)
  )
}
