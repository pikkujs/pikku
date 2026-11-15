import { PikkuError } from '@pikku/core/errors'
import { verifySpkiSignature } from '@pikku/core/hmac'
import {
  DomainPolicyError,
  KeyCustodyLostError,
  KeyRetiredError,
  KeyUnavailableError,
  type CoreKeyPair,
  type Jwk,
  type KeyAlgorithm,
  type KeyCustody,
  type KeyHealth,
  type KeyOptions,
  type KeyPairDefinitionsMeta,
  type KeyPlacer,
  type KeyPublisher,
  type KeyRecord,
  type KeyService,
  type KeySigner,
  type KeyStore,
  type KeyVerifyOptions,
  type PrivateKeyWrapper,
  type PublicKeyInfo,
  type ReconcileSummary,
} from '@pikku/core/keypair'
import {
  holdLease,
  LeaseTakenError,
  LocalSecretService,
  type LeaseService,
  type Logger,
  type SecretService,
} from '@pikku/core/services'
import { parseDurationString } from '@pikku/core/utils'
import {
  generateKeyPair,
  importSigningKey,
  importVerifyKey,
  JWS_ALG,
  pkcs8Bytes,
  publicJwk,
  signBytes,
} from './algorithms.js'
import {
  fromCanonicalBase64Url,
  sha256Hex,
  toBase64Url,
  utf8,
} from './base64.js'
import type { KeyFileCustody } from './custody.js'
import { assertDomain, prefixWithDomain } from './domain.js'
import {
  importSealingKey,
  open as openSealed,
  parseSealedValue,
} from './sealed-box.js'

const DEFAULT_STATUS_TTL_MS = 30_000
const MIN_STATUS_TTL_MS = 1_000
const DEFAULT_PUBLISH_DELAY_MS = 15 * 60_000
const MINTING_GC_MS = 60 * 60_000
const KID_NEGATIVE_CACHE_MS = 30_000
const MAX_PUBLISH_ATTEMPTS = 8

export interface LocalKeyServiceOptions {
  /** The declarations: the generated `KeyPairsMeta` record, or the same objects as a list. */
  definitions: KeyPairDefinitionsMeta | CoreKeyPair[]
  /** The ledger. `FileKeyStore` (from `@pikku/keys/file`), `MemoryKeyStore`, or the Kysely store. */
  store: KeyStore
  /** Needed for custody `secret`. Must be durable (see `secretsDurable`). */
  secrets?: SecretService
  /**
   * Asserts `secrets` is durable when it is a raw backend the host knows.
   * `secretsDurable ?? secrets.durable` is what counts. It never overrides the
   * refusal of a `LocalSecretService`: only `allowEphemeralSecretCustody` does.
   */
  secretsDurable?: boolean
  /** Test only: allows custody `secret` on an in-memory secret service, losing every private half on restart. */
  allowEphemeralSecretCustody?: boolean
  /** Custody `file`: `new FileCustody(dir)` from `@pikku/keys/file`. */
  fileCustody?: KeyFileCustody
  /** Custody `wrapped`. */
  wrapper?: PrivateKeyWrapper
  /** How long a status view is trusted. Default 30 000 ms, minimum 1 000. */
  statusTtlMs?: number
  /** Names whose every sign and verify reads the store (a retired key is a revoked key). */
  strictStatus?: string[]
  /** Pending to active needs this long after publish. Default 15 min. */
  publishDelayMs?: number
  /** Serialises `reconcile` per name and scope across instances. */
  leases?: LeaseService
  logger?: Pick<Logger, 'warn' | 'info' | 'debug'>
  /** Epoch milliseconds. Tests inject a fake clock. */
  now?: () => number
}

type Decl = {
  name: string
  algorithm: KeyAlgorithm
  purpose: 'signing' | 'sealing'
  rotationMs: number | null
  verifyGraceMs: number
  scope: 'deployment' | 'keyed'
  custody: KeyCustody
  public: 'internal' | 'jwks'
  signedFormat: 'domain' | 'jws'
}

type View = { records: KeyRecord[]; loadedAt: number }
type Signing = 'ed25519' | 'rs256'

const keyOf = (name: string, scopeKey: string) => `${name}\u0000${scopeKey}`
const iso = (ms: number) => new Date(ms).toISOString()
const publishedFlag = (rec: KeyRecord) =>
  (rec.metadata as { retiredPublished?: boolean } | null | undefined)
    ?.retiredPublished

/**
 * The reference {@link KeyService}: an in-process keyring over a {@link KeyStore},
 * with the private half in the custody each declaration resolves to.
 *
 * Fails closed throughout: a missing private half is an incident and never a
 * reason to mint over the ledger; a stale status view with an unreachable
 * store refuses to sign. No method returns private bytes, and no error or log
 * line carries any.
 */
export class LocalKeyService implements KeyService {
  private readonly decls = new Map<string, Decl>()
  private readonly store: KeyStore
  private readonly options: LocalKeyServiceOptions
  private readonly statusTtlMs: number
  private readonly publishDelayMs: number
  private readonly strict: Set<string>
  private readonly views = new Map<string, View>()
  private readonly signCache = new Map<string, CryptoKey>()
  private readonly verifyCache = new Map<string, CryptoKey>()
  private readonly integrity = new Map<
    string,
    { at: number; error?: KeyCustodyLostError }
  >()
  private readonly unknownKids = new Map<string, number>()
  private readonly refreshedAt = new Map<string, number>()
  private readonly locks = new Map<string, Promise<unknown>>()
  private readonly publishers = new Map<string, KeyPublisher[]>()
  private readonly placers = new Map<string, KeyPlacer>()
  private readonly counters = new Map<
    string,
    (kid: string) => Promise<number>
  >()
  private readonly promotedHooks = new Map<
    string,
    ((info: {
      previous?: PublicKeyInfo
      current: PublicKeyInfo
    }) => Promise<void>)[]
  >()
  private readonly nowMs: () => number

  constructor(options: LocalKeyServiceOptions) {
    this.options = options
    this.store = options.store
    this.nowMs = options.now ?? Date.now
    this.statusTtlMs = Math.max(
      options.statusTtlMs ?? DEFAULT_STATUS_TTL_MS,
      MIN_STATUS_TTL_MS
    )
    this.publishDelayMs = options.publishDelayMs ?? DEFAULT_PUBLISH_DELAY_MS
    this.strict = new Set(options.strictStatus ?? [])
    const list = Array.isArray(options.definitions)
      ? options.definitions
      : Object.values(options.definitions)
    for (const def of list) this.decls.set(def.name, this.declare(def))
    for (const name of this.strict) {
      if (!this.decls.has(name)) {
        throw new Error(`strictStatus names an undeclared key '${name}'.`)
      }
    }
  }

  /** Verifies every `deployment` name's private halves are usable; a miss refuses to start. */
  async start(): Promise<this> {
    for (const decl of this.decls.values()) {
      if (decl.scope === 'deployment') {
        await this.ensureIntegrity(decl, 'default')
      }
    }
    return this
  }

  // ---------------------------------------------------------------- declarations

  private declare(def: {
    name: string
    algorithm: string
    purpose: string
    rotationPeriod: string
    verifyGrace: string
    scope: string
    custody?: string
    public?: string
    signedFormat?: string
  }): Decl {
    const custody = this.resolveCustody(def)
    const signing = def.purpose === 'signing'
    return {
      name: def.name,
      algorithm: def.algorithm as KeyAlgorithm,
      purpose: def.purpose as 'signing' | 'sealing',
      rotationMs:
        def.rotationPeriod === 'never'
          ? null
          : parseDurationString(def.rotationPeriod),
      verifyGraceMs: parseDurationString(def.verifyGrace),
      scope: def.scope as 'deployment' | 'keyed',
      custody,
      public: (def.public ?? 'internal') as 'internal' | 'jwks',
      signedFormat: signing
        ? ((def.signedFormat ?? 'domain') as 'domain' | 'jws')
        : 'jws',
    }
  }

  /** D.1: no blind default, and `secret` custody only where the private half survives a restart. */
  private resolveCustody(def: {
    name: string
    scope: string
    custody?: string
  }): KeyCustody {
    const { secrets, secretsDurable, fileCustody, wrapper } = this.options
    const ephemeralOk = this.options.allowEphemeralSecretCustody === true
    const isLocal = secrets instanceof LocalSecretService
    const durable = secretsDurable ?? secrets?.durable === true
    const secretOk =
      secrets !== undefined && (isLocal ? ephemeralOk : durable || ephemeralOk)
    const refuse = (why: string): never => {
      throw new KeyCustodyLostError(`Key '${def.name}': ${why}`)
    }
    const secretWhy = !secrets
      ? "custody 'secret' needs a SecretService"
      : isLocal
        ? "custody 'secret' is refused on LocalSecretService (the private half would be lost on restart); use custody 'file' or a durable SecretService such as KyselySecretService"
        : "custody 'secret' needs a durable SecretService (it must declare `durable: true`, or the host asserts `secretsDurable`); use custody 'file' or KyselySecretService"
    const declared = def.custody as KeyCustody | undefined
    if (declared === 'file' && def.scope === 'keyed') {
      refuse("custody 'file' cannot hold a keyed scope")
    }
    if (declared === 'secret') return secretOk ? 'secret' : refuse(secretWhy)
    if (declared === 'file') {
      return fileCustody ? 'file' : refuse("custody 'file' needs fileCustody")
    }
    if (declared === 'wrapped') {
      return wrapper ? 'wrapped' : refuse("custody 'wrapped' needs a wrapper")
    }
    if (declared === 'external') return 'external'
    if (fileCustody && def.scope !== 'keyed') return 'file'
    if (secretOk) return 'secret'
    return refuse(`choose a custody. ${secretWhy}`)
  }

  private decl(name: string, purpose?: 'signing' | 'sealing'): Decl {
    const decl = this.decls.get(name)
    if (!decl) throw new Error(`No key pair named '${name}' is declared.`)
    if (purpose && decl.purpose !== purpose) {
      throw new Error(
        `Key pair '${name}' is a ${decl.purpose} key, not a ${purpose} key.`
      )
    }
    return decl
  }

  private scopeOf(decl: Decl, opts?: KeyOptions): string {
    if (decl.scope === 'deployment') return 'default'
    if (!opts?.scopeKey) {
      throw new Error(`Key pair '${decl.name}' is keyed: pass a scopeKey.`)
    }
    return opts.scopeKey
  }

  /** O1 = B: a `domain` name always takes a domain, a `jws` name never does. */
  private domainFor(
    decl: Decl,
    domain: string | undefined
  ): string | undefined {
    if (decl.signedFormat === 'jws') {
      if (domain !== undefined) {
        throw new DomainPolicyError(
          `Key pair '${decl.name}' is signedFormat 'jws': a domain is refused.`
        )
      }
      return undefined
    }
    if (domain === undefined) {
      throw new DomainPolicyError(
        `Key pair '${decl.name}' is signedFormat 'domain': pass a domain.`
      )
    }
    return assertDomain(domain)
  }

  private signedBytes(
    domain: string | undefined,
    data: Uint8Array | string
  ): Uint8Array {
    if (domain !== undefined) return prefixWithDomain(domain, data)
    return typeof data === 'string' ? utf8(data) : data
  }

  // -------------------------------------------------------------- store + views

  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve()
    const run = previous.then(fn, fn)
    const tail = run.catch(() => undefined)
    this.locks.set(key, tail)
    try {
      return await run
    } finally {
      if (this.locks.get(key) === tail) this.locks.delete(key)
    }
  }

  private async load(name: string, scopeKey: string): Promise<View> {
    let records: KeyRecord[]
    try {
      records = await this.store.list(name, scopeKey)
    } catch (error) {
      this.options.logger?.warn(
        `key store unreachable for '${name}': ${(error as Error).name}`
      )
      throw new KeyUnavailableError(
        `The key store is unreachable for '${name}'.`
      )
    }
    for (const rec of records) {
      if (rec.status === 'retired') this.signCache.delete(rec.kid)
    }
    const view = { records, loadedAt: this.nowMs() }
    this.views.set(keyOf(name, scopeKey), view)
    return view
  }

  /** The status view, reloaded when older than `statusTtlMs` (or always when `force`). */
  private async view(
    name: string,
    scopeKey: string,
    force = false
  ): Promise<View> {
    const held = this.views.get(keyOf(name, scopeKey))
    if (!force && held && this.nowMs() - held.loadedAt <= this.statusTtlMs) {
      return held
    }
    return this.load(name, scopeKey)
  }

  private accepted(
    rec: KeyRecord,
    now: number,
    historical = false,
    sealing = false
  ): boolean {
    if (rec.status === 'active') return true
    if (rec.status === 'previous') {
      // A sealing key stays `previous` until its rows are re-sealed, past verifyUntil too.
      return (
        sealing ||
        (rec.verifyUntil !== undefined && now < Date.parse(rec.verifyUntil))
      )
    }
    return rec.status === 'retired' && historical
  }

  private info(rec: KeyRecord): PublicKeyInfo {
    return {
      kid: rec.kid,
      name: rec.name,
      scopeKey: rec.scopeKey,
      version: rec.version,
      algorithm: rec.algorithm,
      purpose: rec.purpose as PublicKeyInfo['purpose'],
      publicKey: rec.publicKey!,
      status: rec.status as PublicKeyInfo['status'],
      ...(rec.activatedAt ? { activatedAt: rec.activatedAt } : {}),
      ...(rec.verifyUntil ? { verifyUntil: rec.verifyUntil } : {}),
    }
  }

  // -------------------------------------------------------------------- custody

  private async secretId(name: string, kid: string) {
    return `KEY_${name.toUpperCase().replace(/-/g, '_')}_${(await sha256Hex(kid)).slice(0, 16)}`
  }

  private async placePrivate(
    decl: Decl,
    rec: KeyRecord,
    pkcs8: string
  ): Promise<void> {
    const { secrets, fileCustody, wrapper } = this.options
    if (rec.custody === 'secret') {
      await secrets!.setSecret(rec.privateRef!, { privateKey: pkcs8 })
    } else if (rec.custody === 'file') {
      await fileCustody!.write(rec.privateRef!, pkcs8)
    } else if (rec.custody === 'wrapped') {
      const { wrapped, metadata } = await wrapper!.wrap(pkcs8, rec.scopeKey)
      const ok = await this.store.updateCustody(
        rec.kid,
        { rev: rec.rev },
        { privateWrapped: wrapped, metadata: metadata ?? null }
      )
      if (!ok) throw new Error('The ledger row changed while placing the key.')
    } else if (rec.custody === 'external') {
      const placer = this.placers.get(decl.name)
      if (!placer) {
        throw new KeyCustodyLostError(
          `Key '${decl.name}' is custody 'external' but no placer is registered (onPlace).`
        )
      }
      await placer.place(rec.name, rec.scopeKey, rec.kid, pkcs8Bytes(pkcs8))
    }
  }

  private async readPrivate(rec: KeyRecord): Promise<string> {
    const { secrets, fileCustody, wrapper } = this.options
    if (rec.custody === 'external') {
      throw new KeyUnavailableError(
        `The private half of '${rec.name}' is held elsewhere (custody 'external') and cannot be used here.`
      )
    }
    try {
      if (rec.custody === 'secret') {
        const value = await secrets!.getSecret<{ privateKey: string }>(
          rec.privateRef!
        )
        return value.reveal().privateKey
      }
      if (rec.custody === 'file')
        return await fileCustody!.read(rec.privateRef!)
      if (rec.custody === 'wrapped') {
        if (!rec.privateWrapped) throw new Error('no wrapped half')
        return await wrapper!.unwrap(
          rec.privateWrapped,
          rec.scopeKey,
          rec.metadata ?? undefined
        )
      }
    } catch (error) {
      // The cause is logged by class only: a backend message may quote a path or a value.
      this.options.logger?.warn(
        `private half of ${rec.name}/${rec.kid} unreadable: ${(error as Error).name}`
      )
      this.signCache.delete(rec.kid)
      throw new KeyCustodyLostError(
        `The private half of key '${rec.name}' (${rec.kid}) cannot be read.`
      )
    }
    throw new KeyCustodyLostError(
      `Key '${rec.name}' has unsupported custody '${rec.custody}'.`
    )
  }

  private async hasPrivate(rec: KeyRecord): Promise<boolean> {
    const { secrets, fileCustody } = this.options
    try {
      if (rec.custody === 'secret') {
        return await secrets!.hasSecret(rec.privateRef!)
      }
      if (rec.custody === 'file') return await fileCustody!.has(rec.privateRef!)
      if (rec.custody === 'wrapped') {
        await this.readPrivate(rec)
        return true
      }
    } catch {
      return false
    }
    return true
  }

  private async removePrivate(rec: KeyRecord): Promise<void> {
    const { secrets, fileCustody } = this.options
    if (rec.custody === 'secret') await secrets!.deleteSecret(rec.privateRef!)
    else if (rec.custody === 'file') await fileCustody!.remove(rec.privateRef!)
    else if (rec.custody === 'external') {
      await this.placers
        .get(rec.name)
        ?.remove?.(rec.name, rec.scopeKey, rec.kid)
    }
    // `wrapped`: the ciphertext stays in the ledger row; retiring the row is what ends its use.
  }

  /** D.1.3: every live version's private half resolves, memoised for `statusTtlMs`. A miss fails that scope only. */
  private async ensureIntegrity(decl: Decl, scopeKey: string): Promise<void> {
    const key = keyOf(decl.name, scopeKey)
    const memo = this.integrity.get(key)
    if (memo && this.nowMs() - memo.at <= this.statusTtlMs) {
      if (memo.error) throw memo.error
      return
    }
    const records = (await this.view(decl.name, scopeKey, true)).records
    for (const rec of records) {
      if (!['active', 'previous', 'pending'].includes(rec.status)) continue
      if (rec.custody === 'external') continue
      if (!(await this.hasPrivate(rec))) {
        const error = new KeyCustodyLostError(
          `The private half of key '${decl.name}' (${rec.kid}) is missing. Refusing to continue: this is an incident, not a reason to rotate.`
        )
        this.integrity.set(key, { at: this.nowMs(), error })
        this.signCache.delete(rec.kid)
        throw error
      }
    }
    this.integrity.set(key, { at: this.nowMs() })
  }

  private async signingKey(rec: KeyRecord): Promise<CryptoKey> {
    const cached = this.signCache.get(rec.kid)
    if (cached) return cached
    const pkcs8 = await this.readPrivate(rec)
    const key = await importSigningKey(pkcs8, rec.algorithm as Signing)
    this.signCache.set(rec.kid, key)
    return key
  }

  private async verifyKey(
    rec: Pick<KeyRecord, 'kid' | 'publicKey' | 'algorithm'>
  ): Promise<CryptoKey> {
    const cached = this.verifyCache.get(rec.kid)
    if (cached) return cached
    const key = await importVerifyKey(rec.publicKey!, rec.algorithm as Signing)
    this.verifyCache.set(rec.kid, key)
    return key
  }

  // -------------------------------------------------------------------- signing

  async signer(
    name: string,
    opts?: KeyOptions & { domain?: string }
  ): Promise<KeySigner> {
    const decl = this.decl(name, 'signing')
    const domain = this.domainFor(decl, opts?.domain)
    const scopeKey = this.scopeOf(decl, opts)
    await this.ensureIntegrity(decl, scopeKey)
    const view = await this.view(name, scopeKey, this.strict.has(name))
    const active = view.records.find((r) => r.status === 'active')
    if (!active) {
      throw new KeyUnavailableError(`No active key for '${name}'.`)
    }
    const kid = active.kid
    return {
      kid,
      alg: decl.algorithm,
      jwsAlg: JWS_ALG[decl.algorithm as Signing],
      version: active.version,
      sign: (data) => this.signWith(decl, scopeKey, kid, domain, data),
    }
  }

  /** B.1b step 2: re-check the version's status on every sign, then sign. */
  private async signWith(
    decl: Decl,
    scopeKey: string,
    kid: string,
    domain: string | undefined,
    data: Uint8Array | string
  ): Promise<string> {
    let rec: KeyRecord | undefined
    if (this.strict.has(decl.name)) {
      try {
        rec = await this.store.get(kid)
      } catch {
        throw new KeyUnavailableError(
          `The key store is unreachable for '${decl.name}'.`
        )
      }
    } else {
      rec = (await this.view(decl.name, scopeKey)).records.find(
        (r) => r.kid === kid
      )
    }
    if (!rec || !this.accepted(rec, this.nowMs())) {
      this.signCache.delete(kid)
      throw new KeyRetiredError(
        `Key version ${kid} of '${decl.name}' no longer signs. Take a new signer.`
      )
    }
    const key = await this.signingKey(rec)
    const signature = await signBytes(
      key,
      decl.algorithm as Signing,
      this.signedBytes(domain, data)
    )
    return toBase64Url(signature)
  }

  async sign(
    name: string,
    data: Uint8Array | string,
    opts?: KeyOptions & { domain?: string }
  ): Promise<{ kid: string; alg: KeyAlgorithm; signature: string }> {
    const decl = this.decl(name, 'signing')
    if (decl.signedFormat === 'jws') {
      throw new DomainPolicyError(
        `Key pair '${name}' is signedFormat 'jws': it has only signer(), which carries the kid for the header.`
      )
    }
    const handle = await this.signer(name, opts)
    return {
      kid: handle.kid,
      alg: handle.alg,
      signature: await handle.sign(data),
    }
  }

  async verify(
    name: string,
    data: Uint8Array | string,
    signature: string,
    opts?: KeyVerifyOptions
  ): Promise<boolean> {
    const decl = this.decl(name, 'signing')
    const domain = this.domainFor(decl, opts?.domain)
    const scopeKey = this.scopeOf(decl, opts)
    const view = await this.view(name, scopeKey, this.strict.has(name))
    const now = this.nowMs()
    let candidates: KeyRecord[]
    if (opts?.kid !== undefined) {
      const found =
        view.records.find((r) => r.kid === opts.kid) ??
        (await this.refreshForUnknownKid(name, scopeKey, opts.kid))
      if (!found) return false
      candidates = [found]
    } else {
      candidates = view.records
    }
    const sig = fromCanonicalBase64Url(signature)
    if (!sig) return false
    const bytes = this.signedBytes(domain, data)
    for (const rec of candidates) {
      if (rec.status === 'pending' || !rec.publicKey) continue
      if (!this.accepted(rec, now, opts?.historical === true)) continue
      try {
        const key = await this.verifyKey(rec)
        if (
          await verifySpkiSignature(key, decl.algorithm as Signing, sig, bytes)
        ) {
          return true
        }
      } catch {
        // A malformed signature or key is a failed verify, never an exception.
      }
    }
    return false
  }

  /** M4: an unknown kid costs at most one store read per name per 30 s, then a 30 s negative cache. */
  private async refreshForUnknownKid(
    name: string,
    scopeKey: string,
    kid: string
  ): Promise<KeyRecord | undefined> {
    const now = this.nowMs()
    const negative = `${keyOf(name, scopeKey)}\u0000${kid}`
    if ((this.unknownKids.get(negative) ?? 0) > now) return undefined
    const scope = keyOf(name, scopeKey)
    if (
      now - (this.refreshedAt.get(scope) ?? -Infinity) >=
      KID_NEGATIVE_CACHE_MS
    ) {
      this.refreshedAt.set(scope, now)
      const view = await this.view(name, scopeKey, true)
      const found = view.records.find((r) => r.kid === kid)
      if (found) return found
    }
    this.unknownKids.set(negative, now + KID_NEGATIVE_CACHE_MS)
    return undefined
  }

  async open(name: string, sealed: string, opts?: KeyOptions): Promise<string> {
    const decl = this.decl(name, 'sealing')
    const scopeKey = this.scopeOf(decl, opts)
    const envelope = parseSealedValue(sealed)
    await this.ensureIntegrity(decl, scopeKey)
    const view = await this.view(name, scopeKey, this.strict.has(name))
    const rec = view.records.find((r) => r.kid === envelope.kid)
    if (!rec) {
      throw new KeyUnavailableError(`'${name}' holds no key ${envelope.kid}.`)
    }
    if (rec.status === 'retired') {
      throw new KeyRetiredError(`Key ${envelope.kid} of '${name}' is retired.`)
    }
    if (!this.accepted(rec, this.nowMs(), false, true)) {
      throw new KeyUnavailableError(
        `Key ${envelope.kid} of '${name}' is not open for use yet.`
      )
    }
    const pkcs8 = await this.readPrivate(rec)
    const key = await importSealingKey(pkcs8Bytes(pkcs8))
    return openSealed(key, rec.publicKey!, envelope)
  }

  // ------------------------------------------------------------------ public set

  async publicKeys(
    name: string,
    opts?: KeyOptions & { includePending?: boolean; includeRetired?: boolean }
  ): Promise<PublicKeyInfo[]> {
    const decl = this.decl(name)
    const scopeKey = this.scopeOf(decl, opts)
    const { records } = await this.view(name, scopeKey, this.strict.has(name))
    const now = this.nowMs()
    const sealing = decl.purpose === 'sealing'
    const pick = (status: KeyRecord['status']) =>
      records.filter((r) => r.status === status)
    const out = [
      ...pick('active'),
      ...pick('previous').filter((r) => this.accepted(r, now, false, sealing)),
      ...(opts?.includePending ? pick('pending') : []),
      ...(opts?.includeRetired ? pick('retired') : []),
    ]
    return out.map((r) => this.info(r))
  }

  async jwks(name: string, opts?: KeyOptions): Promise<{ keys: Jwk[] }> {
    const decl = this.decl(name, 'signing')
    if (decl.public !== 'jwks') {
      throw new Error(`Key pair '${name}' is not declared public: 'jwks'.`)
    }
    const keys = await this.publicKeys(name, { ...opts, includePending: true })
    const alg = decl.algorithm as Signing
    return {
      keys: await Promise.all(
        keys.map(async (k) => ({
          ...(await publicJwk(await this.verifyKey(k), alg)),
          kid: k.kid,
          alg: JWS_ALG[alg],
          use: 'sig',
        }))
      ),
    }
  }

  // ------------------------------------------------------------------ lifecycle

  /** C.3: the order inside a mint is what lets a crash at any point leave a row that names what to clean. */
  private async mint(decl: Decl, scopeKey: string): Promise<KeyRecord> {
    const existing = await this.store.list(decl.name, scopeKey)
    const version = existing.reduce((max, r) => Math.max(max, r.version), 0) + 1
    const pair = await generateKeyPair(decl.algorithm)
    const now = iso(this.nowMs())
    const custody = decl.custody
    const privateRef =
      custody === 'secret'
        ? await this.secretId(decl.name, pair.kid)
        : custody === 'file'
          ? this.options.fileCustody!.refFor(decl.name, scopeKey, pair.kid)
          : null
    const row: KeyRecord = {
      kid: pair.kid,
      name: decl.name,
      scopeKey,
      version,
      algorithm: decl.algorithm,
      purpose: decl.purpose,
      status: 'minting',
      createdAt: now,
      custody,
      privateRef,
      privateWrapped: null,
      metadata: null,
      rev: 0,
    }
    await this.store.insertPending(row)
    try {
      await this.placePrivate(decl, row, pair.privateKey)
    } catch (error) {
      // The backend's message may quote the value it was given: log the class, throw a fixed text.
      this.options.logger?.warn(
        `placing the private half of ${decl.name}/${pair.kid} failed: ${(error as Error).name}`
      )
      if (error instanceof KeyCustodyLostError) throw error
      throw new KeyCustodyLostError(
        `The private half of key '${decl.name}' (${pair.kid}) could not be placed in custody '${custody}'.`
      )
    }
    if (custody === 'external') {
      await this.placers
        .get(decl.name)
        ?.confirm?.(decl.name, scopeKey, pair.kid)
    } else {
      await this.verifyPlaced(decl, row, pair.publicKey)
    }
    if (!(await this.store.markPlaced(pair.kid, pair.publicKey, now))) {
      throw new Error('The ledger row changed while minting.')
    }
    await this.load(decl.name, scopeKey)
    return (await this.store.get(pair.kid))!
  }

  /** C.3 step 4: read the half back from custody and use it once, before the key is ever advertised. */
  private async verifyPlaced(decl: Decl, row: KeyRecord, publicKey: string) {
    const fresh = (await this.store.get(row.kid)) ?? row
    const pkcs8 = await this.readPrivate(fresh)
    if (decl.purpose !== 'signing') {
      await importSealingKey(pkcs8Bytes(pkcs8))
      return
    }
    const alg = decl.algorithm as Signing
    const probe = utf8('pikku-key-placement-probe')
    const signature = await signBytes(
      await importSigningKey(pkcs8, alg),
      alg,
      probe
    )
    const verifier = await importVerifyKey(publicKey, alg)
    if (!(await verifySpkiSignature(verifier, alg, signature, probe))) {
      throw new KeyCustodyLostError(
        `The placed half of '${decl.name}' does not match its public key.`
      )
    }
  }

  async generate(name: string, opts?: KeyOptions): Promise<PublicKeyInfo> {
    const decl = this.decl(name)
    const scopeKey = this.scopeOf(decl, opts)
    return this.withLock(keyOf(name, scopeKey), async () => {
      const records = await this.store.list(name, scopeKey)
      const active = records.find((r) => r.status === 'active')
      const pending = records.find((r) => r.status === 'pending')
      if (active) {
        return this.info(pending ?? (await this.mint(decl, scopeKey)))
      }
      const first = pending ?? (await this.mint(decl, scopeKey))
      await this.promoteRecord(decl, scopeKey, first, undefined, this.nowMs())
      return this.info((await this.store.get(first.kid))!)
    })
  }

  async rotate(name: string, opts?: KeyOptions): Promise<PublicKeyInfo> {
    return this.generate(name, opts)
  }

  /** The single commit point: one store transaction flips pending to active and active to previous. */
  private async promoteRecord(
    decl: Decl,
    scopeKey: string,
    pending: KeyRecord,
    active: KeyRecord | undefined,
    now: number
  ): Promise<void> {
    const ok = await this.store.promote({
      pendingKid: pending.kid,
      activeKid: active?.kid,
      verifyUntil: active ? iso(now + decl.verifyGraceMs) : undefined,
      now: iso(now),
    })
    if (!ok) {
      throw new Error(`The ledger changed while promoting '${decl.name}'.`)
    }
    const view = await this.load(decl.name, scopeKey)
    const current = view.records.find((r) => r.kid === pending.kid)!
    const previous = active && view.records.find((r) => r.kid === active.kid)
    for (const hook of this.promotedHooks.get(decl.name) ?? []) {
      try {
        await hook({
          current: this.info(current),
          ...(previous ? { previous: this.info(previous) } : {}),
        })
      } catch (error) {
        this.options.logger?.warn(
          `onPromoted hook for '${decl.name}' failed: ${(error as Error).name}`
        )
      }
    }
    await this.publish(decl, scopeKey)
  }

  /** Pushes the FULL accepted set to every publisher. Returns whether all succeeded. */
  private async publish(decl: Decl, scopeKey: string): Promise<boolean> {
    const publishers = this.publishers.get(decl.name) ?? []
    if (!publishers.length) return true
    const now = this.nowMs()
    const records = (await this.store.list(decl.name, scopeKey)).filter(
      (r) =>
        r.status === 'pending' ||
        this.accepted(r, now, false, decl.purpose === 'sealing')
    )
    const set = records.map((r) => this.info(r))
    let ok = true
    for (const publisher of publishers) {
      try {
        await publisher.publish(decl.name, scopeKey, set)
      } catch (error) {
        ok = false
        this.options.logger?.warn(
          `publisher for '${decl.name}' failed: ${(error as Error).name}`
        )
      }
    }
    return ok
  }

  async promote(name: string, kid: string, opts?: KeyOptions): Promise<void> {
    const decl = this.decl(name)
    const scopeKey = this.scopeOf(decl, opts)
    await this.withLock(keyOf(name, scopeKey), async () => {
      const now = this.nowMs()
      const records = await this.store.list(name, scopeKey)
      const pending = records.find((r) => r.kid === kid)
      if (!pending || pending.status !== 'pending') {
        throw new Error(`Key ${kid} of '${name}' is not pending.`)
      }
      const active = records.find((r) => r.status === 'active')
      if (active && !(await this.publishedFor(decl, scopeKey, pending, now))) {
        throw new KeyUnavailableError(
          `Key ${kid} of '${name}' is not published and past the publish delay yet.`
        )
      }
      await this.promoteRecord(decl, scopeKey, pending, active, now)
    })
  }

  /** Published to every registered publisher, and `publishDelayMs` has passed since. */
  private async publishedFor(
    decl: Decl,
    scopeKey: string,
    pending: KeyRecord,
    now: number
  ): Promise<boolean> {
    let publishedAt = pending.publishedAt
    if (!publishedAt) {
      if (!(await this.publish(decl, scopeKey))) return false
      publishedAt = iso(now)
      await this.store.markPublished(pending.kid, publishedAt)
    }
    return now - Date.parse(publishedAt) >= this.publishDelayMs
  }

  async retire(
    name: string,
    kid: string,
    opts?: KeyOptions & { force?: boolean }
  ): Promise<void> {
    const decl = this.decl(name)
    const scopeKey = this.scopeOf(decl, opts)
    await this.withLock(keyOf(name, scopeKey), async () => {
      const rec = await this.store.get(kid)
      if (!rec || rec.name !== name || rec.scopeKey !== scopeKey) {
        throw new Error(`'${name}' has no key ${kid}.`)
      }
      if (rec.status === 'active') {
        throw new Error(
          `Key ${kid} of '${name}' is active: promote a successor, or revoke it.`
        )
      }
      if (decl.purpose === 'sealing' && !opts?.force) {
        const counter = this.counters.get(name)
        const used = counter ? await counter(kid) : undefined
        if (used === undefined || used > 0) {
          throw new Error(
            used === undefined
              ? `Key ${kid} of '${name}' may still seal rows: register onUsage, or force.`
              : `Key ${kid} of '${name}' still seals ${used} rows.`
          )
        }
      }
      await this.retireRecord(decl, scopeKey, rec, this.nowMs())
    })
  }

  /** M2: CAS to retired FIRST, then publish the reduced set, then destroy the private half of a signing key. */
  private async retireRecord(
    decl: Decl,
    scopeKey: string,
    rec: KeyRecord,
    now: number
  ): Promise<void> {
    if (await this.store.retire(rec.kid, iso(now))) {
      this.signCache.delete(rec.kid)
      this.verifyCache.delete(rec.kid)
      await this.load(decl.name, scopeKey)
      const published = await this.publish(decl, scopeKey)
      const fresh = (await this.store.get(rec.kid)) ?? rec
      await this.store.updateCustody(
        rec.kid,
        { rev: fresh.rev },
        { metadata: { ...fresh.metadata, retiredPublished: published } }
      )
    }
    if (decl.purpose === 'signing') {
      await this.removePrivate(rec).catch((error) =>
        this.options.logger?.warn(
          `could not destroy retired half of ${rec.name}/${rec.kid}: ${(error as Error).name}`
        )
      )
    }
  }

  async revoke(name: string, kid: string, opts?: KeyOptions): Promise<void> {
    const decl = this.decl(name)
    const scopeKey = this.scopeOf(decl, opts)
    await this.withLock(keyOf(name, scopeKey), async () => {
      const now = this.nowMs()
      const records = await this.store.list(name, scopeKey)
      const rec = records.find((r) => r.kid === kid)
      if (!rec) throw new Error(`'${name}' has no key ${kid}.`)
      if (rec.status === 'active') {
        // The successor is active BEFORE the old key is retired, so signing never has a gap.
        const pending = records.find((r) => r.status === 'pending')
        const successor = pending ?? (await this.mint(decl, scopeKey))
        await this.promoteRecord(decl, scopeKey, successor, rec, now)
      }
      this.signCache.delete(kid)
      const current = (await this.store.get(kid)) ?? rec
      await this.retireRecord(decl, scopeKey, current, now)
    })
  }

  // -------------------------------------------------------------------- health

  async keyHealth(name: string, opts?: KeyOptions): Promise<KeyHealth[]> {
    const decl = this.decl(name)
    const scopes =
      decl.scope === 'deployment'
        ? ['default']
        : opts?.scopeKey
          ? [opts.scopeKey]
          : await this.store.listScopeKeys(name)
    const out: KeyHealth[] = []
    for (const scopeKey of scopes) {
      out.push(await this.healthOf(decl, scopeKey))
    }
    return out
  }

  private async healthOf(decl: Decl, scopeKey: string): Promise<KeyHealth> {
    const base = { name: decl.name, scopeKey }
    let records: KeyRecord[]
    try {
      records = (await this.view(decl.name, scopeKey, true)).records
    } catch {
      return { ...base, state: 'unavailable' }
    }
    try {
      this.integrity.delete(keyOf(decl.name, scopeKey))
      await this.ensureIntegrity(decl, scopeKey)
    } catch (error) {
      if (error instanceof KeyCustodyLostError) {
        return { ...base, state: 'custody-lost', detail: error.message }
      }
      return { ...base, state: 'unavailable' }
    }
    const now = this.nowMs()
    const unpublished = records.filter(
      (r) => r.status === 'retired' && publishedFlag(r) === false
    )
    if (unpublished.length) {
      return {
        ...base,
        state: 'overdue-unpublish',
        kids: unpublished.map((r) => r.kid),
      }
    }
    const lateSealing = records.filter(
      (r) =>
        decl.purpose === 'sealing' &&
        r.status === 'previous' &&
        r.verifyUntil !== undefined &&
        now >= Date.parse(r.verifyUntil)
    )
    if (lateSealing.length) {
      return {
        ...base,
        state: 'overdue-reseal',
        kids: lateSealing.map((r) => r.kid),
      }
    }
    const stuck = records.filter(
      (r) =>
        r.status === 'pending' &&
        now - Date.parse(r.createdAt) > 2 * this.publishDelayMs
    )
    if (stuck.length) {
      return { ...base, state: 'overdue', kids: stuck.map((r) => r.kid) }
    }
    return { ...base, state: 'ok' }
  }

  // ----------------------------------------------------------------- reconcile

  async reconcile(nowOverride?: number): Promise<ReconcileSummary> {
    const now = nowOverride ?? this.nowMs()
    const summary: ReconcileSummary = {
      minted: [],
      promoted: [],
      retired: [],
      current: [],
      skipped: [],
      failed: [],
    }
    for (const decl of this.decls.values()) {
      const scopes =
        decl.scope === 'deployment'
          ? ['default']
          : await this.store.listScopeKeys(decl.name).catch(() => [])
      for (const scopeKey of scopes) {
        const target = `${decl.name}:${scopeKey}`
        try {
          const run = () =>
            this.withLock(keyOf(decl.name, scopeKey), () =>
              this.reconcileScope(decl, scopeKey, now, summary, target)
            )
          if (this.options.leases) {
            await holdLease(
              this.options.leases,
              `keys:reconcile:${decl.name}:${scopeKey}`,
              run
            )
          } else {
            await run()
          }
        } catch (error) {
          if (
            error instanceof LeaseTakenError ||
            error instanceof KeyUnavailableError
          ) {
            summary.skipped.push(target)
          } else {
            summary.failed.push({
              target,
              // Only our own errors carry a message written here; anything else is named by class.
              error:
                error instanceof PikkuError
                  ? `${error.name}: ${error.message}`
                  : (error as Error).name,
            })
            this.options.logger?.warn(
              `key reconcile failed for ${target}: ${(error as Error).name}`
            )
          }
        }
      }
    }
    return summary
  }

  private async reconcileScope(
    decl: Decl,
    scopeKey: string,
    now: number,
    summary: ReconcileSummary,
    target: string
  ) {
    // Never mint over a ledger row whose private half is missing: that is an incident.
    this.integrity.delete(keyOf(decl.name, scopeKey))
    const loaded = (await this.view(decl.name, scopeKey, true)).records
    await this.ensureIntegrity(decl, scopeKey)

    // Garbage-collect crashed mints and half-retired rows by the location the row names.
    for (const rec of loaded) {
      if (
        rec.status === 'minting' &&
        now - Date.parse(rec.createdAt) > MINTING_GC_MS
      ) {
        await this.store.retire(rec.kid, iso(now))
        await this.removePrivate(rec).catch(() => undefined)
      } else if (
        rec.status === 'retired' &&
        decl.purpose === 'signing' &&
        rec.custody !== 'wrapped' &&
        rec.custody !== 'external' &&
        (await this.hasPrivate(rec))
      ) {
        await this.removePrivate(rec).catch(() => undefined)
      } else if (rec.status === 'retired' && publishedFlag(rec) === false) {
        if (await this.publish(decl, scopeKey)) {
          await this.store.updateCustody(
            rec.kid,
            { rev: rec.rev },
            { metadata: { ...rec.metadata, retiredPublished: true } }
          )
        }
      }
    }
    const records = await this.store.list(decl.name, scopeKey)
    const active = records.find((r) => r.status === 'active')
    const pending = records.find((r) => r.status === 'pending')
    const previous = records.filter((r) => r.status === 'previous')

    if (!active) {
      const first = pending ?? (await this.mint(decl, scopeKey))
      await this.promoteRecord(decl, scopeKey, first, undefined, now)
      summary.minted.push(first.kid)
      return
    }
    const due =
      decl.rotationMs !== null &&
      now >=
        Date.parse(active.activatedAt ?? active.createdAt) + decl.rotationMs
    if (due && !pending) {
      const minted = await this.mint(decl, scopeKey)
      summary.minted.push(minted.kid)
      return
    }
    if (pending) {
      const attempts = Number(
        (pending.metadata as { attempts?: number } | null)?.attempts ?? 0
      )
      if (!pending.publishedAt) {
        if (await this.publish(decl, scopeKey)) {
          await this.store.markPublished(pending.kid, iso(now))
        } else if (attempts + 1 >= MAX_PUBLISH_ATTEMPTS) {
          await this.retireRecord(decl, scopeKey, pending, now)
          summary.retired.push(pending.kid)
          summary.failed.push({ target, error: 'publish attempts exhausted' })
        } else {
          await this.store.updateCustody(
            pending.kid,
            { rev: pending.rev },
            {
              metadata: { ...pending.metadata, attempts: attempts + 1 },
            }
          )
        }
        return
      }
      if (now - Date.parse(pending.publishedAt) >= this.publishDelayMs) {
        await this.promoteRecord(decl, scopeKey, pending, active, now)
        summary.promoted.push(pending.kid)
        return
      }
      summary.current.push(target)
      return
    }
    for (const prev of previous) {
      if (
        prev.verifyUntil === undefined ||
        now < Date.parse(prev.verifyUntil)
      ) {
        continue
      }
      if (decl.purpose === 'sealing') {
        const counter = this.counters.get(decl.name)
        if (!counter || (await counter(prev.kid)) > 0) {
          summary.skipped.push(target)
          continue
        }
      }
      await this.retireRecord(decl, scopeKey, prev, now)
      summary.retired.push(prev.kid)
      return
    }
    summary.current.push(target)
  }

  // --------------------------------------------------------------------- hooks

  onPublish(name: string, publisher: KeyPublisher): void {
    this.decl(name)
    this.publishers.set(name, [...(this.publishers.get(name) ?? []), publisher])
  }

  onPlace(name: string, placer: KeyPlacer): void {
    this.decl(name)
    this.placers.set(name, placer)
  }

  onUsage(name: string, counter: (kid: string) => Promise<number>): void {
    this.decl(name)
    this.counters.set(name, counter)
  }

  onPromoted(
    name: string,
    hook: (info: {
      previous?: PublicKeyInfo
      current: PublicKeyInfo
    }) => Promise<void>
  ): void {
    this.decl(name)
    this.promotedHooks.set(name, [
      ...(this.promotedHooks.get(name) ?? []),
      hook,
    ])
  }
}

/** Creates a {@link LocalKeyService} and runs its start-up checks (custody resolution, and the integrity check of every `deployment` name). */
export const createLocalKeyService = async (
  options: LocalKeyServiceOptions
): Promise<LocalKeyService> => new LocalKeyService(options).start()
