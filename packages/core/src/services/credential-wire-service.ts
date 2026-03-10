export class PikkuCredentialWireService {
  private credentials: Record<string, unknown> = {}

  set(name: string, value: unknown): void {
    this.credentials[name] = value
  }

  getAll(): Record<string, unknown> {
    return this.credentials
  }

  getScoped(allowedNames: string[]): Record<string, unknown> {
    const scoped: Record<string, unknown> = {}
    for (const name of allowedNames) {
      if (name in this.credentials) {
        scoped[name] = this.credentials[name]
      }
    }
    return scoped
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
