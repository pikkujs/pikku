// Stand-ins for the generated pikkuFunc: a function either has a body or is
// declared `mock: true` with only its input and output types.
type Handler<I, O> = (services: {}, data: I, wire: {}) => Promise<O>
type Implemented<I, O> = { func: Handler<I, O>; expose?: boolean; mock?: never }
type Mocked = { mock: true; func?: never; expose?: boolean }

export declare function pikkuFunc<I, O>(
  config: Implemented<I, O> | Mocked
): Implemented<I, O>
