import type { ParsedNode } from './types.js'

/**
 * The outcome of trying to translate an n8n Code / Function node into a real
 * Pikku function body. Only pure, self-contained JavaScript is translated —
 * anything that reaches outside its own input (other nodes, the environment,
 * the network, `require`) stays a throwing stub for a human (or the
 * `pikku-n8n-code-translate` skill) to finish.
 */
export type CodeTranslation =
  | {
      translatable: true
      mode: 'all' | 'each'
      source: string
      /** n8n node names referenced via `$("X")` / `$node["X"]` (statically). */
      refs: string[]
      /** Reads the incoming item stream (`$input` / `$json` / legacy `items`). */
      usesInput: boolean
    }
  | { translatable: false; reason: string }

const STATIC_NODE_REF = /\$(?:\(\s*|node\s*\[\s*)['"`]([^'"`]+)['"`]\s*[)\]]/g

/** Collect the distinct node names a body reads via `$("X")` / `$node["X"]`. */
export function extractNodeRefs(source: string): string[] {
  const names = new Set<string>()
  for (const m of source.matchAll(STATIC_NODE_REF)) names.add(m[1]!)
  return [...names]
}

/** The graph-input / shim key a `$("X")` reference is wired through. */
export function codeRefKey(name: string): string {
  return `__node_${name.replace(/[^A-Za-z0-9_$]/g, '_')}`
}

/**
 * Tokens that make a Code node non-self-contained. Matching any one bails to a
 * stub — these reference other nodes, the environment, or perform side effects,
 * none of which a purely local translation can honour.
 */
const BAIL: Array<[RegExp, string]> = [
  [/\brequire\s*\(/, 'uses require()'],
  [/(?<![.\w])import[\s(]/, 'uses import'],
  // A computed node reference — `$(expr)` / `$node[expr]` where the target is
  // not a string literal — can't be resolved to a graph ref, so it bails.
  [/\$\(\s*[^'"`\s)]/, 'references a dynamic node ($(expr))'],
  [/\$node\s*\[\s*[^'"`\s\]]/, 'references a dynamic node ($node[expr])'],
  [/\$vars\b/, 'reads $vars'],
  [/\$secrets\b/, 'reads $secrets'],
  [/\$workflow\b/, 'reads $workflow'],
  [/\$execution\b/, 'reads $execution'],
  [/\$prevNode\b/, 'reads $prevNode'],
  [/\$getWorkflowStaticData\b/, 'uses workflow static data'],
  [/\.helpers\b/, 'uses n8n helpers'],
  [/\bfetch\s*\(/, 'performs network I/O (fetch)'],
  [/\bawait\b/, 'awaits async work'],
  [/\bprocess\s*\./, 'accesses process'],
]

/**
 * Decide whether an n8n Code node's body can be lowered 1:1 into a Pikku
 * function. Pure module — no fs, no codegen — so it can drive both naming
 * (a translatable node is not a stub) and emission.
 */
export function translateCodeNode(node: ParsedNode): CodeTranslation {
  const source =
    (node.parameters.jsCode as string | undefined) ??
    (node.parameters.functionCode as string | undefined) ??
    ''
  const code = source.trim()
  if (!code) return { translatable: false, reason: 'empty code' }

  const language = node.parameters.language
  if (typeof language === 'string' && language !== 'javaScript')
    return { translatable: false, reason: `unsupported language "${language}"` }

  for (const [pattern, reason] of BAIL)
    if (pattern.test(code)) return { translatable: false, reason }

  const mode: 'all' | 'each' =
    node.parameters.mode === 'runOnceForEachItem' ||
    node.typeShort === 'functionItem'
      ? 'each'
      : 'all'

  const usesInput =
    /\$input\b|\$json\b|(?<![.\w$])items?\b/.test(code) ||
    node.typeShort === 'function' ||
    node.typeShort === 'functionItem'

  return {
    translatable: true,
    mode,
    source,
    refs: extractNodeRefs(code),
    usesInput,
  }
}
