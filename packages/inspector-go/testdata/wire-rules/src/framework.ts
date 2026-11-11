import { pikkuSessionlessFunc } from './core.js'
import { workflowService } from '../framework/index.js'
import { publishedService } from '../framework-dts/index.js'

declare const untyped: any
declare function helper(...args: unknown[]): void

// A project function that forwards to the framework method takes the wire as
// an argument at its own call site, so it is refused there.
function wrapper(name: string, rpc: unknown) {
  return workflowService.runToCompletion(name, {}, rpc)
}

// The framework's own method may take the wire.
export const callsFramework = pikkuSessionlessFunc({
  func: async (_services, _data, wire) => {
    await workflowService.runToCompletion('a', {}, wire.rpc)
  },
})

// A framework package shipped as declarations only (the node_modules shape) is
// the framework's all the same.
export const callsPublishedFramework = pikkuSessionlessFunc({
  func: async (_services, _data, wire) => {
    await publishedService.runToCompletion('a', {}, wire.rpc)
  },
})

export const callsUserHelper = pikkuSessionlessFunc({
  func: async (_services, _data, wire) => {
    helper(wire.rpc)
  },
})

export const callsUnresolved = pikkuSessionlessFunc({
  func: async (_services, _data, wire) => {
    untyped.run(wire.rpc)
    ;(untyped as () => void)()
    untyped['run'](wire.rpc)
  },
})

// The same helper declared at module level and given the wire is refused.
const moduleHelper = (r: { invoke(name: string): unknown }) => r.invoke('x')
export const callsModuleHelper = pikkuSessionlessFunc({
  func: async (_services, _data, { rpc }) => {
    moduleHelper(rpc)
  },
})

export const callsWrapper = pikkuSessionlessFunc({
  func: async (_services, _data, wire) => {
    await wrapper('a', wire.rpc)
  },
})
