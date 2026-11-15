/** The algorithms a key pair may use. HMAC stays `defineSecret`; ECDSA and RSA-PSS are not supported. */
export type KeyAlgorithm = 'ed25519' | 'x25519' | 'rs256'

/** What a key pair is for: `signing` keys sign and verify, `sealing` keys open what was sealed to them. */
export type KeyPurpose = 'signing' | 'sealing'

/** Where the private half lives. It is only ever named here, never carried. */
export type KeyCustody = 'secret' | 'file' | 'wrapped' | 'external'

/** One keyring for the deployment, or one per `scopeKey` passed at call time. */
export type KeyScope = 'deployment' | 'keyed'

/** Whether the public half may be rendered as a JWKS. */
export type KeyPublic = 'internal' | 'jwks'

export const KEY_ALGORITHMS = ['ed25519', 'x25519', 'rs256'] as const
export const KEY_PURPOSES = ['signing', 'sealing'] as const
export const KEY_CUSTODIES = ['secret', 'file', 'wrapped', 'external'] as const
export const KEY_SCOPES = ['deployment', 'keyed'] as const
export const KEY_PUBLICS = ['internal', 'jwks'] as const

/** Which purpose each algorithm serves. */
export const KEY_ALGORITHM_PURPOSE: Record<KeyAlgorithm, KeyPurpose> = {
  ed25519: 'signing',
  x25519: 'sealing',
  rs256: 'signing',
}

/**
 * The declaration {@link defineKeyPair} takes. It describes a key pair, never
 * its key material: no field here can carry a private key.
 */
export type CoreKeyPair = {
  /** kebab-case; the name `keys.sign('name', ...)` and `keys.open('name', ...)` autocomplete. */
  name: string
  displayName: string
  description?: string
  /** `ed25519` and `rs256` sign, `x25519` seals. `rs256` exists for legacy JWKS consumers. */
  algorithm: KeyAlgorithm
  purpose: KeyPurpose
  /** A duration such as `'90day'` or `'1w'`, or `'never'`. Must be at least twice `verifyGrace`. */
  rotationPeriod: string
  /** How long the previous version still verifies or opens after a rotation. At least `1h`. */
  verifyGrace: string
  /**
   * The longest-lived thing this key signs, such as `'300s'`. `verifyGrace` must
   * be at least `signedLifetime` + 10 minutes (verifier cache) + 5 seconds
   * (clock skew). Signing keys only.
   */
  signedLifetime?: string
  /** `deployment` is one keyring; `keyed` is one per `scopeKey` passed at call time, opaque to core. */
  scope: KeyScope
  /** Where the private half lives. Omitted means the service decides when it starts. */
  custody?: KeyCustody
  /** `internal` (default) keeps the public half to key service callers; `jwks` lets it be rendered as a JWKS. */
  public?: KeyPublic
  docsUrl?: string
}

/** The declaration fields, in the order they are written to meta. */
export const KEY_PAIR_FIELDS = [
  'name',
  'displayName',
  'description',
  'algorithm',
  'purpose',
  'rotationPeriod',
  'verifyGrace',
  'signedLifetime',
  'scope',
  'custody',
  'public',
  'docsUrl',
] as const satisfies readonly (keyof CoreKeyPair)[]

type AssertAllFields =
  Exclude<keyof CoreKeyPair, (typeof KEY_PAIR_FIELDS)[number]> extends never
    ? true
    : never
export const _keyPairFieldsAreComplete: AssertAllFields = true

/** A key pair declaration as recorded in generated meta. Values are what the inspector read, unchecked. */
export type KeyPairDefinitionMeta = Omit<
  CoreKeyPair,
  'algorithm' | 'purpose' | 'scope' | 'custody' | 'public'
> & {
  algorithm: string
  purpose: string
  scope: string
  custody?: string
  public?: string
  sourceFile?: string
}

/** Key pair declarations as the inspector found them, in discovery order. */
export type KeyPairDefinitions = KeyPairDefinitionMeta[]

/** Key pair declarations collected by the CLI, keyed by name. Carries no source path, so it is stable across machines. */
export type KeyPairDefinitionsMeta = Record<
  string,
  Omit<KeyPairDefinitionMeta, 'sourceFile'>
>

/** What the generated `KeyPairsMap` records per name. */
export type KeyPairInfo = { purpose: KeyPurpose; algorithm: KeyAlgorithm }
export type KeyPairsMapLike = Record<string, KeyPairInfo>

/** Names of the signing keys in a generated map. What `keys.sign` accepts. */
export type SigningKeyName<M extends KeyPairsMapLike> = {
  [K in keyof M & string]: M[K]['purpose'] extends 'signing' ? K : never
}[keyof M & string]

/** Names of the sealing keys in a generated map. What `keys.open` accepts. */
export type SealingKeyName<M extends KeyPairsMapLike> = {
  [K in keyof M & string]: M[K]['purpose'] extends 'sealing' ? K : never
}[keyof M & string]

/**
 * Declares an asymmetric key pair by name: algorithm, purpose, rotation, verify
 * grace and scope. The CLI collects every declaration into a `KeyPairsMap`, so
 * `keys.sign` only accepts signing names and `keys.open` only sealing names.
 * The declaration never holds key material.
 *
 * @example snippet: keyPairs
 */
export const defineKeyPair = (_config: CoreKeyPair): void => {}
