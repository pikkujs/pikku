import { pikkuSessionlessFunc } from './core.js'

const KNOWN = 'billing:charge'
const NAMES = { a: 'one' } as const
declare function helper(...args: unknown[]): void
declare class Keeper { constructor(...args: unknown[]) }
declare const util: { run(...args: unknown[]): void }

// Literal and known-const names are fine.
export const goodNames = pikkuSessionlessFunc({
  func: async (_services, _data, { rpc }) => {
    await rpc.invoke('literal')
    await rpc.invoke(KNOWN)
    await rpc.startWorkflow(NAMES.a)
  },
})

// Computed names are errors.
export const computedNames = pikkuSessionlessFunc({
  func: async (_services, data, { rpc }) => {
    const name = data.name as string
    await rpc.invoke(name)
    await rpc.mesh(`x:${name}`)
    await rpc.startWorkflow(name)
  },
})

// The wire itself handed to a function declared outside the handler is an
// error, however it is carried.
export const leaksWires = pikkuSessionlessFunc({
  func: async (_services, _data, wire) => {
    helper(wire)
    helper({ rpc: wire.rpc })
    helper(...[wire.channel])
    helper(`${wire.http}`)
    helper(wire.rpc ?? 1)
    helper(true ? wire.workflow : 2)
    helper(wire.http!.response)
    util.run(wire.rpc)
    new Keeper(wire.rpc)
  },
})

export const leaksDestructured = pikkuSessionlessFunc({
  func: async (_services, _data, { rpc, session }) => {
    helper(rpc)
    helper(1, { session, rpc })
    const r = rpc
    helper(r)
  },
})

// A closure that only calls the wire keeps it bound. A wire handed on inside
// the closure is judged at that inner call.
export const closures = pikkuSessionlessFunc({
  func: async (_services, _data, wire) => {
    await Promise.all([1, 2].map((i) => wire.rpc.invoke('a', i)))
    util.run(async () => {
      await wire.rpc.invoke('b')
    })
    util.run(() => helper(wire.rpc))
  },
})

// Declared inside the handler: the wire stays bound to it.
export const localHelpers = pikkuSessionlessFunc({
  func: async (_services, data, { rpc }) => {
    const viaClosure = async () => rpc.invoke('x', data)
    const viaParam = (r: typeof rpc) => r.invoke('y')
    function declared(r: typeof rpc) {
      return r.invoke('z')
    }
    const obj = { run: (r: typeof rpc) => r.invoke('w') }
    await viaClosure()
    await viaParam(rpc)
    await declared(rpc)
    await obj.run(rpc)
    await ((r: typeof rpc) => r.invoke('v'))(rpc)
  },
})

// A local function that forwards the wire to an outside helper is refused at
// that inner call, through a parameter or a closure.
export const localForwards = pikkuSessionlessFunc({
  func: async (_services, _data, { rpc }) => {
    const forward = (r: typeof rpc) => helper(r)
    forward(rpc)
    const capture = () => helper(rpc)
    capture()
  },
})

// A local called `rpc` or `wire` is not a wire.
export const shadowed = pikkuSessionlessFunc({
  func: async (_services, _data, { rpc }) => {
    const run = (name: string, wire: string) => helper(name, wire)
    run('a', 'b')
    const inner = (rpc: string) => helper(rpc)
    inner('c')
    await rpc.invoke('literal')
  },
})

// Services, plain data, the logger, session and http request fields and
// methods of a wire itself are fine.
export const staysBound = pikkuSessionlessFunc({
  func: async (services, data, wire) => {
    helper(services)
    helper(services.db, data)
    helper(wire.logger)
    helper(wire.session)
    helper(wire.session?.userId)
    helper(wire.session!.userId)
    helper(wire.channel?.channelId)
    helper(wire.http?.request)
    helper(wire.rpc?.depth)
    helper(await wire.rpc.invoke('literal'))
    helper(wire.rpc.invoke('literal'))
    await wire.rpc.invoke('literal', wire.session)
    const body = JSON.stringify(wire.session?.userId)
    helper(body)
    return wire.session
  },
})
