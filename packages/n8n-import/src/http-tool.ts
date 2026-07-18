/**
 * Maps an n8n `toolHttpRequest` / `httpRequestTool` agent-tool node onto a real,
 * self-contained Pikku tool function that performs the configured HTTP call —
 * the agent-tool sibling of the main-flow `httpRequest` → `graph:httpRequest`
 * mapping. Only a *static* request is convertible: a runtime-dynamic URL
 * (`$fromAI`, `{{ … }}`, `{placeholder}`) needs an LLM-filled input schema (a v2
 * concern) and stays a throwing stub, exactly like `httpAuthRecipe` returning
 * `undefined`. Auth reuses the same `httpAuthRecipe` recipe table as the main
 * `httpRequest` node, so OAuth2 / custom auth also stay stubs.
 */
import type { HttpAuthDescriptor, N8nCredentialRef } from './types.js'
import { httpAuthRecipe, type AuthNode } from './http-auth-map.js'

/** The node fields a tool spec reads — satisfied by both N8nNode and ParsedNode. */
export interface HttpToolNode extends AuthNode {
  name: string
  typeShort?: string
  parameters?: Record<string, unknown>
  credentials?: Record<string, N8nCredentialRef>
}

/** A fully-static HTTP tool call, ready to emit as a real Pikku function. */
export interface HttpToolSpec {
  url: string
  method: string
  /** Static request headers (dynamic-valued headers are dropped). */
  headers: Record<string, string>
  /** Static query-string parameters (dynamic-valued params are dropped). */
  query: Record<string, string>
  /** The tool description the agent surfaces to the LLM. */
  description: string
  /** Auth resolved from a secret at runtime; absent for a no-auth tool. */
  auth?: HttpAuthDescriptor
}

const TOOL_TYPES = new Set(['toolhttprequest', 'httprequesttool'])

export function isHttpRequestTool(typeShort: string): boolean {
  return TOOL_TYPES.has(typeShort.toLowerCase())
}

/** A value usable as a literal — a plain string with no n8n expression/placeholder. */
function staticString(v: unknown): string | undefined {
  if (typeof v !== 'string' || v === '') return undefined
  if (v.startsWith('=') || v.includes('{{') || v.includes('$fromAI'))
    return undefined
  // A `{name}` placeholder is filled by the LLM at call time — not static.
  if (/\{[^}]+\}/.test(v)) return undefined
  return v
}

/** Collect static `{ name, value }` pairs from an n8n params collection. */
function staticPairs(collection: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  const values = (collection as { values?: unknown } | undefined)?.values
  if (!Array.isArray(values)) return out
  for (const entry of values) {
    if (!entry || typeof entry !== 'object') continue
    const name = (entry as { name?: unknown }).name
    const value = (entry as { value?: unknown }).value
    if (typeof name !== 'string' || !name) continue
    const staticVal = staticString(value)
    if (staticVal !== undefined) out[name] = staticVal
  }
  return out
}

/**
 * The static HTTP tool spec for a `toolHttpRequest` node, or `undefined` when the
 * request can't be lowered to a fixed call (dynamic URL, or OAuth2/custom auth
 * with no static recipe) — the caller then leaves the node a throwing stub.
 */
export function httpToolSpec(node: HttpToolNode): HttpToolSpec | undefined {
  const p = node.parameters ?? {}
  const url = staticString(p.url)
  if (!url) return undefined

  const methodRaw = typeof p.method === 'string' ? p.method : 'GET'
  const method = methodRaw.toUpperCase()

  let auth: HttpAuthDescriptor | undefined
  const authentication =
    typeof p.authentication === 'string' ? p.authentication : undefined
  if (authentication && authentication !== 'none') {
    auth = httpAuthRecipe(node)
    // Authed but no static recipe (OAuth2 / custom) → stays a stub.
    if (!auth) return undefined
  }

  const description =
    (typeof p.toolDescription === 'string' && p.toolDescription) || node.name

  return {
    url,
    method,
    headers: staticPairs(p.parametersHeaders),
    query: staticPairs(p.parametersQuery),
    description,
    auth,
  }
}
