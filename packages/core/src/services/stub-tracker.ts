export type StubCall = { service: string; method: string; args: unknown[] }

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

  record(service: string, method: string, args: unknown[]): void {
    const list = this.calls.get(service) ?? []
    list.push({ method, args, verified: false })
    this.calls.set(service, list)
  }

  getCalls(service?: string): StubCall[] {
    const result: StubCall[] = []
    for (const [name, list] of this.calls) {
      if (service && name !== service) continue
      for (const call of list) {
        result.push({ service: name, method: call.method, args: call.args })
      }
    }
    return result
  }

  reset(): void {
    this.calls.clear()
    this.touched.clear()
  }

  stub<T>(service: string): T {
    const self = this
    return new Proxy(Object.create(null) as object, {
      get(_, method: string) {
        return (...args: unknown[]) => {
          self.record(service, method, args)
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

  assertCall(
    service: string,
    method: string,
    predicate: (args: unknown[]) => boolean,
    description: string
  ): void {
    this.touched.add(service)
    const list = this.calls.get(service) ?? []
    const idx = list.findIndex(
      (c) => c.method === method && !c.verified && predicate(c.args)
    )
    if (idx === -1) {
      const seen =
        list
          .filter((c) => c.method === method)
          .map((c) => JSON.stringify(c.args[0]))
          .join('\n  ') || '(none)'
      throw new Error(`Expected ${description} but found:\n  ${seen}`)
    }
    list[idx]!.verified = true
  }

  assertNoCalls(
    service: string,
    method?: string,
    predicate?: (args: unknown[]) => boolean,
    description?: string
  ): void {
    this.touched.add(service)
    const list = this.calls.get(service) ?? []
    const relevant = (
      method ? list.filter((c) => c.method === method) : list
    ).filter((c) => !predicate || predicate(c.args))
    if (relevant.length > 0) {
      const calls = relevant
        .map(
          (c) =>
            `${c.method}(${c.args.map((a) => JSON.stringify(a)).join(', ')})`
        )
        .join('\n  ')
      const what = description ?? `"${service}${method ? '.' + method : ''}"`
      throw new Error(`Expected no ${what} calls but got:\n  ${calls}`)
    }
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

/**
 * Creates a Proxy suitable for passing as `existingServices` to
 * `createSingletonServices`. Every property returns `tracker.stub(prop)`
 * EXCEPT `schema`, which returns `undefined` so the service factory creates
 * a real schema service. Stubbing the schema makes validation a no-op —
 * required fields pass silently and tests validate nothing.
 */
export function createStubProxy(tracker: StubTracker): Record<string, unknown> {
  return new Proxy({} as Record<string, unknown>, {
    get(_, prop: string) {
      if (prop === 'schema') return undefined
      return tracker.stub(prop)
    },
  })
}

const defaultStubTracker = new StubTracker()

/** The process-wide tracker that `stub()`/`spy()` record into — read by the console's getStubCalls/resetStubs RPCs */
export const getStubTracker = (): StubTracker => defaultStubTracker

/** True when the server was started by `pikku dev --test` (sets PIKKU_TEST_RUN) */
export const isTestRun = (): boolean =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.PIKKU_TEST_RUN === 'true'

/**
 * Creates a recording fake for a service. Methods present on `impl` run and
 * their result is returned; missing methods resolve `undefined`. Every call
 * is recorded so scenarios can assert via workflow.expectService().
 */
export function stub<T = any>(service: string, impl?: Partial<T>): T {
  return new Proxy((impl ?? {}) as object, {
    get(target: any, method: string | symbol) {
      if (typeof method === 'symbol') return target[method]
      const real = target[method]
      if (typeof real !== 'function' && real !== undefined) return real
      return (...args: unknown[]) => {
        defaultStubTracker.record(service, method, args)
        return real ? real.apply(target, args) : Promise.resolve(undefined)
      }
    },
  }) as T
}

/** Wraps a real service so every method call is recorded and passed through */
export function spy<T extends object>(service: string, real: T): T {
  return new Proxy(real, {
    get(target: any, method: string | symbol) {
      const value = target[method]
      if (typeof method === 'symbol' || typeof value !== 'function') {
        return value
      }
      return (...args: unknown[]) => {
        defaultStubTracker.record(service, method, args)
        return value.apply(target, args)
      }
    },
  }) as T
}
