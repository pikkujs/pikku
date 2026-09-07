import { isSecretValue } from '../classification/secret-value.js'
import type { CredentialService } from './credential-service.js'
import { defaultPikkuUserIdResolver } from './pikku-user-id.js'
import type { PikkuRawWire } from '../types/core.types.js'
import type { SecretService } from './secret-service.js'

/**
 * Where one credential's value is read from. Decided by what the credential IS
 * — its declared type, as the wiring may have overridden it — and never by
 * whether a per-user lookup came back empty. An absence-driven fallback would
 * let a user who has not connected read the deployment's own token.
 */
export type CredentialResolution =
  { mode: 'wire' } | { mode: 'singleton' } | { mode: 'secret'; key: string }

export type CredentialResolutionConfig = {
  /** Keyed by the resolved (post-alias) credential name. */
  resolutions: Record<string, CredentialResolution>
  secrets?: SecretService
}

export class PikkuCredentialWireService {
  private credentials: Record<string, unknown> = {}
  private loaded = false
  private loadPromise: Promise<void> | undefined

  constructor(
    private credentialService?: CredentialService,
    private wire?: PikkuRawWire,
    private aliases?: Record<string, string>,
    private resolution?: CredentialResolutionConfig
  ) {}

  private resolveName(name: string): string {
    return this.aliases?.[name] ?? name
  }

  /**
   * A credential is one of the few places vault material is meant to end up, so
   * a `SecretValue` is unwrapped here rather than rejected — `get` promises the
   * raw material, and storing the wrapper would make that a lie.
   */
  set(name: string, value: unknown): void {
    this.credentials[this.resolveName(name)] = isSecretValue(value)
      ? value.reveal()
      : value
  }

  get<T = unknown>(name: string): T | null | Promise<T | null> {
    const key = this.resolveName(name)
    if (this.loaded) return (this.credentials[key] as T) ?? null
    return this.lazyLoad().then(() => (this.credentials[key] as T) ?? null)
  }

  getAll(): Record<string, unknown> | Promise<Record<string, unknown>> {
    if (this.loaded) return this.credentials
    return this.lazyLoad().then(() => this.credentials)
  }

  getScoped(
    allowedNames: string[]
  ): Record<string, unknown> | Promise<Record<string, unknown>> {
    const buildScoped = () => {
      const scoped: Record<string, unknown> = {}
      for (const name of allowedNames) {
        if (name in this.credentials) {
          scoped[name] = this.credentials[name]
        }
      }
      return scoped
    }
    if (this.loaded) return buildScoped()
    return this.lazyLoad().then(buildScoped)
  }

  private lazyLoad(): Promise<void> {
    if (this.loadPromise) return this.loadPromise
    this.loadPromise = this.doLoad()
    return this.loadPromise
  }

  /**
   * `loaded` means "the credentials are in hand", never "a load has started".
   *
   * The distinction matters because `get`, `getAll` and `getScoped` all answer
   * SYNCHRONOUSLY once it is set. Setting it before the await let every caller
   * that arrived while the fetch was still in flight take that synchronous path
   * over an empty map and receive `null` for a credential that exists — the
   * first of N concurrent readers got the value and the rest silently did not.
   * `loadPromise` is what guards against loading twice; this flag is only ever
   * about whether the fast path is safe to take.
   *
   * `finally` rather than a trailing assignment: the two early returns (no
   * service or wire, no resolvable user) are settled states as well — there is
   * nothing to fetch — so they should reach the fast path too.
   */
  private async doLoad(): Promise<void> {
    try {
      if (!this.credentialService && !this.resolution) return
      const userId = this.wire
        ? defaultPikkuUserIdResolver(this.wire)
        : undefined
      if (this.credentialService && this.wire && userId) {
        this.wire.pikkuUserId = userId
        const allCreds = await this.credentialService.getAll(userId)
        for (const [name, value] of Object.entries(allCreds)) {
          if (!(name in this.credentials)) {
            this.credentials[name] = value
          }
        }
      }
      await this.loadDeploymentCredentials()
    } finally {
      this.loaded = true
    }
  }

  /**
   * The `singleton` and `secret` halves of the dispatch. `wire` is absent here
   * on purpose: those values arrive with `getAll(userId)` above, so a wire
   * credential can never pick up a platform value that happens to exist.
   */
  private async loadDeploymentCredentials(): Promise<void> {
    const resolutions = this.resolution?.resolutions
    if (!resolutions) return

    for (const [name, resolution] of Object.entries(resolutions)) {
      if (resolution.mode === 'wire' || name in this.credentials) continue

      if (resolution.mode === 'singleton') {
        if (!this.credentialService) continue
        const value = await this.credentialService.get(name)
        if (value !== null) {
          this.credentials[name] = value
        }
        continue
      }

      const secrets = this.resolution?.secrets
      if (!secrets) continue
      const secret = await secrets.getSecret(resolution.key)
      this.credentials[name] = isSecretValue(secret) ? secret.reveal() : secret
    }
  }
}

export function createMiddlewareCredentialWireProps(
  credentialWire: PikkuCredentialWireService
) {
  return {
    setCredential: (name: string, value: unknown) =>
      credentialWire.set(name, value),
  }
}

export function createWireServicesCredentialWireProps(
  credentialWire: PikkuCredentialWireService,
  allowedNames?: string[]
) {
  return {
    setCredential: (name: string, value: unknown) =>
      credentialWire.set(name, value),
    getCredential: <T = unknown>(name: string) => credentialWire.get<T>(name),
    getCredentials: () =>
      allowedNames
        ? credentialWire.getScoped(allowedNames)
        : credentialWire.getAll(),
  }
}
