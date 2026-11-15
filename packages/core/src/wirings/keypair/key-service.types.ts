import type { KeyAlgorithm, KeyCustody, KeyPurpose } from './keypair.types.js'

/** The states a key version moves through. `minting` exists only in the store and is never returned by a {@link KeyService}. */
export type KeyStatus = 'pending' | 'active' | 'previous' | 'retired'

/** The public half of one key version. `publicKey` is always SPKI DER, base64. */
export interface PublicKeyInfo {
  /** Opaque, stored, never recomputed. New keys: the RFC 7638 thumbprint of the public key. */
  kid: string
  name: string
  /** `'default'` for a `deployment` scope. */
  scopeKey: string
  /** Monotonic per `(name, scopeKey)`, never reused. */
  version: number
  algorithm: KeyAlgorithm
  purpose: KeyPurpose
  publicKey: string
  status: KeyStatus
  activatedAt?: string
  /** Set when the version becomes `previous`. */
  verifyUntil?: string
}

export interface KeyOptions {
  scopeKey?: string
}

/**
 * One snapshot of the active version: `kid`, `alg` and `version` are fixed when
 * the handle is taken, and `sign` signs with exactly that version, so a header
 * built from the handle can never name a different version than the signature.
 *
 * The handle does not own the private key and does not outlive a revoke: every
 * `sign` re-checks the version's status. Handles are per operation: never store
 * one in a field or a module variable.
 */
export interface KeySigner {
  readonly kid: string
  readonly alg: KeyAlgorithm
  /** The JWS `alg` header value: `'EdDSA'` for ed25519, `'RS256'` for rs256. Never write `alg` into a header. */
  readonly jwsAlg: 'EdDSA' | 'RS256'
  readonly version: number
  /**
   * The base64url signature by this version. Allowed while the version is
   * `active`, or `previous` and before `verifyUntil`. Throws `KeyRetiredError`
   * once it is retired, revoked or past `verifyUntil`, and
   * `KeyUnavailableError` when the status view is stale and the store is
   * unreachable. For a domain-prefixed name the handle already carries the domain.
   */
  sign(data: Uint8Array | string): Promise<string>
}

export type KeyVerifyOptions = KeyOptions & {
  kid?: string
  /** Also accept retired versions (audit rows verify forever). */
  historical?: boolean
  domain?: string
}

export type KeyHealthState =
  | 'ok'
  | 'custody-lost'
  | 'overdue'
  | 'overdue-reseal'
  | 'overdue-unpublish'
  | 'unavailable'

/** Per `(name, scopeKey)` health. */
export type KeyHealth = {
  name: string
  scopeKey: string
  state: KeyHealthState
  kids?: string[]
  detail?: string
}

export type ReconcileSummary = {
  minted: string[]
  promoted: string[]
  retired: string[]
  current: string[]
  skipped: string[]
  failed: { target: string; error: string }[]
}

/** An RFC 7517 JSON Web Key as `KeyService.jwks` renders it. */
export type Jwk = {
  kty: string
  kid: string
  alg: string
  use: string
} & Record<string, string>

export interface KeyService {
  /** First key for a name: mints and activates. If a key is active, mints version + 1 as `pending`. Idempotent per `(name, scopeKey, version)`. */
  generate(name: string, opts?: KeyOptions): Promise<PublicKeyInfo>
  /**
   * The signing entry point. Active version only; fails closed
   * (`KeyUnavailableError`) if there is none. Whether `domain` is required or
   * refused follows the name's `signedFormat`: a disagreeing call throws
   * `DomainPolicyError`.
   */
  signer(
    name: string,
    opts?: KeyOptions & { domain?: string }
  ): Promise<KeySigner>
  /**
   * For callers whose signed bytes do not embed the kid (audit hashes,
   * anchors). Never use it to build a JWS header: use {@link signer}. A
   * `'jws'` name has only `signer`.
   */
  sign(
    name: string,
    data: Uint8Array | string,
    opts?: KeyOptions & { domain?: string }
  ): Promise<{ kid: string; alg: KeyAlgorithm; signature: string }>
  /** Never throws on a bad signature; throws only on misconfiguration (unknown name, domain policy). */
  verify(
    name: string,
    data: Uint8Array | string,
    signature: string,
    opts?: KeyVerifyOptions
  ): Promise<boolean>
  /** Sealing keys: opens a sealed envelope using the private half named by the envelope's kid. */
  open(name: string, sealed: string, opts?: KeyOptions): Promise<string>
  /** Active first, then previous. `pending` only with `includePending`; retired only with `includeRetired`. */
  publicKeys(
    name: string,
    opts?: KeyOptions & { includePending?: boolean; includeRetired?: boolean }
  ): Promise<PublicKeyInfo[]>
  /** Force-start a rotation now (mint pending). Does not promote. */
  rotate(name: string, opts?: KeyOptions): Promise<PublicKeyInfo>
  /** Explicit commit point; same preconditions as `reconcile`. */
  promote(name: string, kid: string, opts?: KeyOptions): Promise<void>
  /** Marks retired (compare-and-set first), then destroys the private half of signing keys. Sealing keys: refuses while usage > 0. */
  retire(
    name: string,
    kid: string,
    opts?: KeyOptions & { force?: boolean }
  ): Promise<void>
  /** Emergency path: successor promoted without publish delay, kid retired immediately, publishers run with the reduced set. */
  revoke(name: string, kid: string, opts?: KeyOptions): Promise<void>
  /** An RFC 7517 set of active, previous and pending public keys. Only for names declared `public: 'jwks'`. */
  jwks(name: string, opts?: KeyOptions): Promise<{ keys: Jwk[] }>
  keyHealth(name: string, opts?: KeyOptions): Promise<KeyHealth[]>
  /** One idempotent pass over every declared `(name, scopeKey)`. */
  reconcile(now?: number): Promise<ReconcileSummary>
  /** Registered by the host at service creation, not in the declaration. */
  onPublish(name: string, publisher: KeyPublisher): void
  onPlace(name: string, placer: KeyPlacer): void
  onUsage(name: string, counter: (kid: string) => Promise<number>): void
  onPromoted(
    name: string,
    hook: (info: {
      previous?: PublicKeyInfo
      current: PublicKeyInfo
    }) => Promise<void>
  ): void
}

export interface KeyPublisher {
  /** Push the full accepted set (active, previous and pending) to a consumer. Called on mint, promote and retire/revoke. Throw to keep a pending key pending. */
  publish(name: string, scopeKey: string, keys: PublicKeyInfo[]): Promise<void>
}

export interface KeyPlacer {
  /** `privateBytes` is PKCS8 DER. */
  place(
    name: string,
    scopeKey: string,
    kid: string,
    privateBytes: Uint8Array
  ): Promise<void>
  remove?(name: string, scopeKey: string, kid: string): Promise<void>
  /** An optional remote round trip, not a read-back of the private half. */
  confirm?(name: string, scopeKey: string, kid: string): Promise<void>
}

/** Read-only: what a verifier that does not own the keyring holds. */
export interface PublicKeySet {
  publicKeys(
    name: string,
    opts?: KeyOptions & { includePending?: boolean; includeRetired?: boolean }
  ): Promise<PublicKeyInfo[]>
}

/** Wraps a private half for storage in the ledger (custody `wrapped`). */
export interface PrivateKeyWrapper {
  wrap(
    plain: string,
    scopeKey: string
  ): Promise<{ wrapped: string; metadata?: Record<string, unknown> }>
  unwrap(
    wrapped: string,
    scopeKey: string,
    metadata?: Record<string, unknown>
  ): Promise<string>
  rewrap?(
    wrapped: string,
    scopeKey: string,
    ctx: { from?: Record<string, unknown>; to: Record<string, unknown> }
  ): Promise<{ wrapped: string; metadata?: Record<string, unknown> }>
}

/** Lets a caller run a store call inside its own transaction. Opaque to core. */
export type StoreContext = { tx?: unknown }

/** `derived` is for hosts that store HKDF wrapping rows: no key material. */
export type KeyCustodyKind = KeyCustody | 'derived'

export type KeyRecordStatus = 'minting' | KeyStatus

export interface KeyRecord {
  kid: string
  name: string
  scopeKey: string
  version: number
  algorithm: KeyAlgorithm
  /** Free string: `signing`, `sealing` or `wrapping`. */
  purpose: KeyPurpose | (string & {})
  /** SPKI DER base64. Absent for `wrapping` and while `minting`. */
  publicKey?: string
  status: KeyRecordStatus
  createdAt: string
  activatedAt?: string
  publishedAt?: string
  verifyUntil?: string
  retiredAt?: string
  custody: KeyCustodyKind
  /** Where the private half lives (a secret id or a file path). Null for `wrapped`, `external` and `derived`. */
  privateRef?: string | null
  /** Custody `wrapped` only: ciphertext written by the host's {@link PrivateKeyWrapper}. */
  privateWrapped?: string | null
  metadata?: Record<string, unknown> | null
  /** Compare-and-set token for `updateCustody`, starts at 0. */
  rev: number
}

/** What the SQL and file stores implement. Every method may run inside a caller's transaction. */
export interface KeyStore {
  list(name: string, scopeKey: string, ctx?: StoreContext): Promise<KeyRecord[]>
  get(kid: string, ctx?: StoreContext): Promise<KeyRecord | undefined>
  listScopeKeys(name: string): Promise<string[]>
  /** Unique on `(name, scopeKey, version)`. `rec.status` is `minting` or `pending`. */
  insertPending(rec: KeyRecord, ctx?: StoreContext): Promise<void>
  /** Compare-and-set `minting` to `pending`. */
  markPlaced(
    kid: string,
    publicKey: string,
    now: string,
    ctx?: StoreContext
  ): Promise<boolean>
  markPublished(kid: string, at: string, ctx?: StoreContext): Promise<boolean>
  /** One transaction: `active` to `previous` (with `verifyUntil`) and `pending` to `active`, compare-and-set on both rows. False if either state changed. */
  promote(
    args: {
      pendingKid: string
      activeKid?: string
      verifyUntil?: string
      now: string
    },
    ctx?: StoreContext
  ): Promise<boolean>
  /** Compare-and-set to `retired`; false if it already was. */
  retire(kid: string, now: string, ctx?: StoreContext): Promise<boolean>
  /** Insert as `active` iff none is active. */
  firstActivate(rec: KeyRecord, ctx?: StoreContext): Promise<boolean>
  /** Custody and metadata update, compare-and-set on `rev`. False if the row changed meanwhile. */
  updateCustody(
    kid: string,
    expect: { rev: number },
    set: {
      privateWrapped?: string | null
      metadata?: Record<string, unknown> | null
    },
    ctx?: StoreContext
  ): Promise<boolean>
  /** Bulk import for adoption migrations. `insert` skips existing kids; `reconcile` updates existing then inserts new. */
  importRecords(
    recs: KeyRecord[],
    opts: { mode: 'insert' | 'reconcile' },
    ctx?: StoreContext
  ): Promise<{ inserted: number; updated: number; skipped: number }>
}
