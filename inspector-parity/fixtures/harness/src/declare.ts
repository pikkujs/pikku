// Local stand-ins for @pikku/core/harness, so the fixture needs no install.
type Severity = 'low' | 'medium' | 'high'
type Finding = { severity: Severity; message: string }
type Gate = { name: string; with: (o: { failOn: Severity }) => unknown }

export const pikkuHarnessGate = (config: any): Gate => ({
  ...config,
  with: (o: { failOn: Severity }) => ({ name: config.name, ...o }),
})
export const pikkuHarnessGateAgent = (config: any): Gate => ({
  ...config,
  with: (o: { failOn: Severity }) => ({ name: config.name, ...o }),
})
export const pikkuHarness = (config: any) => config
export type { Finding }
