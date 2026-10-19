// A stand-in for the registry's SDK, cut down to the one function the CLI calls.
type RPCHandler<In, Out> = { input: In; output: Out }

export type ResolveSdkInput = { name: string; range: string }
export type ResolveSdkOutput = {
  version: string
  integrity: string
  url: string
}

export type RPCMap = {
  readonly resolveSdk: RPCHandler<ResolveSdkInput, ResolveSdkOutput>
}
