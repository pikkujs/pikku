import type { ListInput, ListOutput } from './list.types.js'

type BaseConfig<I, O> = {
  expose?: boolean
  func: (services: any, data: I) => Promise<O>
  node?: string
}

type ListConfig<I, O> = Omit<BaseConfig<I, O>, 'node'> & {
  node?: { name: string }
}

export const pikkuListFunc = <
  F extends Record<string, unknown> = {},
  Row = unknown,
  S extends string = never,
>(
  config: ListConfig<ListInput<F, S>, ListOutput<Row>>
): ListConfig<ListInput<F, S>, ListOutput<Row>> => config

export const pikkuFunc = <In, Out>(config: {
  func: (services: any, data: In) => Promise<Out>
}) => config
