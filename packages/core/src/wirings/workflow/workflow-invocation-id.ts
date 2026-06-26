import { createHash } from 'crypto'

// Fixed namespace for pikku workflow step invocation IDs. Frozen — changing it
// would alter every derived invocationId and break dedupe across a deploy.
const PIKKU_WORKFLOW_NAMESPACE = '70696b6b-7500-5770-9f6c-6f77000a0001'

const parseUuid = (uuid: string): Buffer =>
  Buffer.from(uuid.replace(/-/g, ''), 'hex')

const formatUuid = (bytes: Buffer): string => {
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/**
 * RFC 4122 v5 (SHA-1, name-based) UUID. Deterministic: the same name +
 * namespace always yields the same UUID — no `uuid` dependency needed.
 */
export const uuidv5 = (
  name: string,
  namespace: string = PIKKU_WORKFLOW_NAMESPACE
): string => {
  const hash = createHash('sha1')
    .update(parseUuid(namespace))
    .update(name, 'utf8')
    .digest()
  const bytes = hash.subarray(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50 // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // RFC 4122 variant
  return formatUuid(bytes)
}

/**
 * The stable identity of one step *invocation* within a run — the idempotency /
 * dedupe key handed to a step. Unlike `stepId` (minted fresh per attempt), this
 * stays identical across every retry of the same call, because it is derived
 * purely from `runId` + `stepName`, both of which are stable across replays.
 *
 * Same inputs → same UUID, so a step can safely
 * `INSERT … ON CONFLICT (invocation_id)` / pass it as a Stripe idempotency key,
 * and a retry of a half-applied side effect is collapsed onto the first attempt.
 *
 * NOTE: calling the *same* `stepName` more than once in a run is not yet
 * disambiguated here (the store still keys steps by `runId:stepName`); when
 * per-invocation ordinals land, the ordinal becomes the third hash component.
 */
export const deriveInvocationId = (runId: string, stepName: string): string =>
  uuidv5(`${runId}:${stepName}`)
