/**
 * n8n expression classifier. n8n stores an expression as a string value that
 * begins with `=` and interpolates `{{ … }}` blocks of JS. We lower them into
 * the three tiers the Pikku graph input mapper supports:
 *
 *  - literal   → a plain value
 *  - ref       → ref(nodeId, path)                 (pure single reference)
 *  - template  → template('… $0 …', [ref, …])      (literal text + pure refs)
 *  - transform → not declaratively expressible; needs a generated function
 *                (the original expression is preserved verbatim)
 */

export interface RefPart {
  nodeId: string
  path?: string
}

export type ClassifiedExpression =
  | { kind: 'literal'; value: unknown }
  | { kind: 'ref'; nodeId: string; path?: string }
  | { kind: 'template'; parts: string[]; refs: RefPart[] }
  | { kind: 'transform'; expression: string }

export interface ExprContext {
  /** nodeId of the immediate predecessor — what `$json` refers to. */
  predecessorNodeId?: string
  /** All graph-node predecessors in order — the input streams of a join node. */
  predecessorNodeIds?: string[]
  /** Map from original n8n node NAME to sanitized graph nodeId. */
  nameToNodeId: Record<string, string>
  /**
   * Sanitized nodeIds of trigger nodes. A trigger is not a graph node — its data
   * is the graph's implicit `trigger` input — so any reference to one lowers to
   * `ref('trigger', …)`, the only form the generated ref map accepts for it.
   */
  triggerNodeIds?: Set<string>
}

const DOT_PATH = String.raw`(?:\.[A-Za-z_$][\w$]*|\[['"][^'"\]]+['"]\])*`

const RE_JSON = new RegExp(`^\\$json(${DOT_PATH})$`)
const RE_NODE = new RegExp(
  `^\\$node\\[['"]([^'"\\]]+)['"]\\]\\.json(${DOT_PATH})$`
)
const RE_PAREN = new RegExp(
  `^\\$\\(['"]([^'"\\]]+)['"]\\)\\.item\\.json(${DOT_PATH})$`
)

/** Normalize a `.a["b"].c` accessor tail into a dotted path `a.b.c`. */
function normalizePath(tail: string): string | undefined {
  if (!tail) return undefined
  const parts = tail
    .replace(/\[['"]([^'"\]]+)['"]\]/g, '.$1')
    .split('.')
    .filter(Boolean)
  return parts.length ? parts.join('.') : undefined
}

/** A reference to a trigger node collapses to the graph's implicit `trigger` input. */
function resolveNodeId(nodeId: string, ctx: ExprContext): string {
  return ctx.triggerNodeIds?.has(nodeId) ? 'trigger' : nodeId
}

/** Try to interpret one `{{ … }}` body as a pure reference. */
function asPureRef(body: string, ctx: ExprContext): RefPart | null {
  const expr = body.trim()

  let m = RE_JSON.exec(expr)
  if (m) {
    return {
      nodeId: resolveNodeId(ctx.predecessorNodeId ?? 'trigger', ctx),
      path: normalizePath(m[1] ?? ''),
    }
  }
  m = RE_NODE.exec(expr) ?? RE_PAREN.exec(expr)
  if (m) {
    const nodeId = resolveNodeId(ctx.nameToNodeId[m[1]!] ?? 'trigger', ctx)
    return { nodeId, path: normalizePath(m[2] ?? '') }
  }
  return null
}

const BLOCK = /\{\{([\s\S]*?)\}\}/g

/**
 * Classify a single n8n parameter value.
 */
export function classifyExpression(
  value: unknown,
  ctx: ExprContext
): ClassifiedExpression {
  if (typeof value !== 'string' || !value.startsWith('=')) {
    return { kind: 'literal', value }
  }

  const body = value.slice(1)
  const blocks: Array<{ index: number; length: number; content: string }> = []
  let match: RegExpExecArray | null
  BLOCK.lastIndex = 0
  while ((match = BLOCK.exec(body)) !== null) {
    blocks.push({
      index: match.index,
      length: match[0].length,
      content: match[1] ?? '',
    })
  }

  if (blocks.length === 0) {
    return { kind: 'literal', value: body }
  }

  // Single block spanning the whole value → candidate pure ref.
  if (
    blocks.length === 1 &&
    blocks[0]!.index === 0 &&
    blocks[0]!.length === body.length
  ) {
    const ref = asPureRef(blocks[0]!.content, ctx)
    if (ref) return { kind: 'ref', nodeId: ref.nodeId, path: ref.path }
    return { kind: 'transform', expression: value }
  }

  // Multiple blocks / surrounding text → template only if every block is a pure ref.
  const parts: string[] = []
  const refs: RefPart[] = []
  let cursor = 0
  for (const block of blocks) {
    const ref = asPureRef(block.content, ctx)
    if (!ref) return { kind: 'transform', expression: value }
    parts.push(body.slice(cursor, block.index))
    refs.push(ref)
    cursor = block.index + block.length
  }
  parts.push(body.slice(cursor))
  return { kind: 'template', parts, refs }
}
