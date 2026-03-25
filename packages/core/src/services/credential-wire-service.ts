import type { CredentialService } from './credential-service.js'
import { defaultPikkuUserIdResolver } from './pikku-user-id.js'
import type { PikkuWire } from '../types/core.types.js'

export class PikkuCredentialWireService {
  private credentials: Record<string, unknown> = {}
  private loaded = false
  private loadPromise: Promise<void> | undefined

  constructor(
    private credentialService?: CredentialService,
    private wire?: PikkuWire
  ) {}

  set(name: string, value: unknown): void {
    this.credentials[name] = value
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

  private async doLoad(): Promise<void> {
    this.loaded = true
    if (!this.credentialService || !this.wire) return
    const userId = defaultPikkuUserIdResolver(this.wire)
    if (!userId) return
    this.wire.pikkuUserId = userId
    const allCreds = await this.credentialService.getAll(userId)
    for (const [name, value] of Object.entries(allCreds)) {
      if (!(name in this.credentials)) {
        this.credentials[name] = value
      }
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
    getCredentials: () =>
      allowedNames
        ? credentialWire.getScoped(allowedNames)
        : credentialWire.getAll(),
  }
}
