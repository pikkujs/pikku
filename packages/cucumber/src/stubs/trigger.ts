export interface StubTriggerWire {
  wire: {
    invoke(data: unknown): void
  }
  readonly invocations: unknown[]
}

export function createStubTriggerWire(): StubTriggerWire {
  const invocations: unknown[] = []

  return {
    wire: {
      invoke(data: unknown) {
        invocations.push(data)
      },
    },
    get invocations() {
      return invocations
    },
  }
}
