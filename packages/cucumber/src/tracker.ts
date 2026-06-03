type Call = { method: string; args: unknown[]; verified: boolean }

/**
 * Tracks calls made to stubbed services and enforces strict mode:
 * once a scenario asserts any call on a service, every recorded call on that
 * service must be verified by end of scenario — otherwise the After hook fails.
 * Services never touched by an assertion stay lenient.
 */
export class StubTracker {
  private readonly calls = new Map<string, Call[]>()
  private readonly touched = new Set<string>()

  stub<T>(service: string): T {
    const self = this
    return new Proxy(Object.create(null) as object, {
      get(_, method: string) {
        return (...args: unknown[]) => {
          const list = self.calls.get(service) ?? []
          list.push({ method, args, verified: false })
          self.calls.set(service, list)
          return Promise.resolve()
        }
      },
    }) as unknown as T
  }

  assert(service: string, method: string): void {
    this.touched.add(service)
    const list = this.calls.get(service) ?? []
    const idx = list.findIndex((c) => c.method === method && !c.verified)
    if (idx === -1) {
      const seen = list.map((c) => c.method).join(', ') || '(none)'
      throw new Error(
        `Expected "${service}.${method}" to have been called. Recorded: ${seen}`
      )
    }
    list[idx]!.verified = true
  }

  verify(): void {
    const errors: string[] = []
    for (const service of this.touched) {
      const unverified = (this.calls.get(service) ?? []).filter(
        (c) => !c.verified
      )
      for (const c of unverified) {
        const argStr = c.args.map((a) => JSON.stringify(a)).join(', ')
        errors.push(`  ${service}.${c.method}(${argStr})`)
      }
    }
    if (errors.length) {
      throw new Error(
        `Unexpected stub calls — assert them in the scenario or remove the side effect:\n${errors.join('\n')}`
      )
    }
  }
}
