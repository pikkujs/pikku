/**
 * Harness shim — stands in for a project's generated `.pikku/pikku-types.gen.ts`.
 * Typed loosely enough that any well-formed emitted stub compiles, but strict
 * enough that a broken emit (bad identifier, wrong arity, malformed literal)
 * still fails `tsc`.
 */

export type PikkuFuncConfig = {
  name?: string
  description?: string
  input?: unknown
  output?: unknown
  func: (services: any, data: any) => unknown
}

export const pikkuSessionlessFunc = (config: PikkuFuncConfig): PikkuFuncConfig =>
  config

export const pikkuFunc = (config: PikkuFuncConfig): PikkuFuncConfig => config

export type Ref = { $ref: string; path?: string }

export const ref = (name: string, path?: string): Ref => ({ $ref: name, path })
