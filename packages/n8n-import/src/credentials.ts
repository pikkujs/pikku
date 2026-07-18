/**
 * Credential-instance derivation.
 *
 * n8n binds a credential PER NODE, selected from a shared pool — two nodes of
 * the same service can use different accounts ("Slack — Marketing" vs
 * "Slack — Support"). Pikku models that as multiple encapsulated addon
 * INSTANCES of one package, each `wireAddon`'d with its own credential binding
 * (distinct RPC namespace + `credentialOverrides`). This module turns the
 * per-node credential pointers into that deduplicated instance set.
 *
 * The n8n export never carries the secret itself — only the `{ id, name, type }`
 * pointer — so we can provision the instance + its credential NAME automatically
 * and the user fills the secret in once, out of band.
 */
import type { ParsedWorkflow, N8nCredentialRef } from './types.js'
import { toCamelCase, toKebabCase } from './naming.js'
import { httpToolSpec } from './http-tool.js'

/**
 * Stable secret/credential name for an n8n credential pointer. A named ref wins
 * (kebabed) — consistent with the `instanceName` `deriveCredentialInstances`
 * derives — otherwise fall back to a per-node name so distinct nodes don't
 * collide onto one generic key.
 */
export function credentialNameForRef(
  ref: N8nCredentialRef | undefined,
  fallback: string
): string {
  if (ref?.name) return toKebabCase(ref.name)
  return toKebabCase(fallback)
}

export interface CredentialInstance {
  /** Addon instance name — the `wireAddon` name / RPC namespace. */
  instanceName: string
  /** Global credential name this instance binds (== instanceName). */
  credentialName: string
  /** n8n credential type key, e.g. "slackApi". */
  n8nCredType: string
  /** n8n credential id, when present in the export. */
  credId?: string
  /** n8n credential display name, when present in the export. */
  credName?: string
  /** Best-effort addon package this instance is an instance of. */
  package: string
  /** The addon's own credential key that the override remaps. */
  addonCredKey: string
  /** RPC names of the nodes bound to this instance. */
  nodeRpcNames: string[]
}

const CRED_TYPE_SUFFIXES = [
  'OAuth2Api',
  'OAuth2',
  'OAuth1Api',
  'OAuth1',
  'ApiKey',
  'ApiToken',
  'Token',
  'Password',
  'Api',
]

/** "slackApi" -> "slack", "googleSheetsOAuth2Api" -> "googleSheets". */
export function serviceFromCredType(credType: string): string {
  let s = credType
  for (const suffix of CRED_TYPE_SUFFIXES) {
    if (s.length > suffix.length && s.endsWith(suffix)) {
      s = s.slice(0, -suffix.length)
      break
    }
  }
  return toCamelCase(s)
}

/** Best-effort addon package for an n8n credential type. Refined downstream. */
export function packageForCredType(credType: string): string {
  return `@pikku/addon-${toKebabCase(serviceFromCredType(credType))}`
}

function dedupeKey(
  credType: string,
  ref: { id?: string; name?: string }
): string {
  return `${credType}:${ref.id ?? ref.name ?? 'default'}`
}

function instanceNameFor(
  service: string,
  ref: { id?: string; name?: string }
): string {
  if (ref.name) return toKebabCase(ref.name)
  const svc = toKebabCase(service)
  return ref.id ? `${svc}-${ref.id}` : svc
}

/**
 * Deduplicated addon instances across the workflow — one per distinct
 * (credential type, credential id/name) pair, with the nodes bound to each.
 */
export function deriveCredentialInstances(
  parsed: ParsedWorkflow
): CredentialInstance[] {
  const byKey = new Map<string, CredentialInstance>()
  const takenNames = new Map<string, string>()

  for (const node of parsed.nodes) {
    if (node.disabled || !node.credentials) continue
    // An authenticated HTTP Request node resolves its own auth from a secret at
    // runtime (via the `httpAuth` descriptor) — it is not a credentialed addon
    // instance, so it must not spawn a bogus `@pikku/addon-<authtype>` wireAddon.
    if (node.role === 'http') continue
    // A static HTTP Request tool resolves its own auth from a secret at call
    // time (like an authed http node) — not a credentialed addon instance.
    if (node.role === 'agentTool' && httpToolSpec(node)) continue
    for (const [credType, ref] of Object.entries(node.credentials)) {
      const key = dedupeKey(credType, ref)
      const existing = byKey.get(key)
      if (existing) {
        if (!existing.nodeRpcNames.includes(node.rpcName)) {
          existing.nodeRpcNames.push(node.rpcName)
        }
        continue
      }

      const service = serviceFromCredType(credType)
      let name = instanceNameFor(service, ref)
      // Distinct credentials that kebab to the same name get a stable suffix.
      const claimedBy = takenNames.get(name)
      if (claimedBy && claimedBy !== key) {
        let i = 2
        while (takenNames.has(`${name}-${i}`)) i++
        name = `${name}-${i}`
      }
      takenNames.set(name, key)

      byKey.set(key, {
        instanceName: name,
        credentialName: name,
        n8nCredType: credType,
        credId: ref.id,
        credName: ref.name,
        package: packageForCredType(credType),
        addonCredKey: service,
        nodeRpcNames: [node.rpcName],
      })
    }
  }

  return [...byKey.values()]
}

/** Map each node's RPC name to the instance it binds (first credential wins). */
export function nodeInstanceBindings(
  instances: CredentialInstance[]
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const inst of instances) {
    for (const rpc of inst.nodeRpcNames) {
      if (!(rpc in out)) out[rpc] = inst.instanceName
    }
  }
  return out
}
