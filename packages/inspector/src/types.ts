import { ChannelsMeta } from '@pikku/core/channel'
import { HTTPRoutesMeta } from '@pikku/core/http'
import { ScheduledTasksMeta } from '@pikku/core/scheduler'
import { TypesMap } from './types-map.js'
import { FunctionsMeta } from '@pikku/core'
import { RPCMeta } from '../../core/src/rpc/rpc-types.js'

export type PathToNameAndType = Map<
  string,
  { variable: string; type: string | null; typePath: string | null }[]
>

export type MetaInputTypes = Map<
  string,
  {
    query: string[] | undefined
    params: string[] | undefined
    body: string[] | undefined
  }
>

export interface InspectorHTTPState {
  metaInputTypes: MetaInputTypes
  meta: HTTPRoutesMeta
  files: Set<string>
}

export interface InspectorFunctionState {
  typesMap: TypesMap
  files: Map<string, { path: string; exportedName: string }>
  meta: FunctionsMeta
}

export interface InspectorChannelState {
  meta: ChannelsMeta
  files: Set<string>
}

export type InspectorFilters = {
  tags?: string[]
}
export interface InspectorState {
  singletonServicesTypeImportMap: PathToNameAndType
  sessionServicesTypeImportMap: PathToNameAndType
  userSessionTypeImportMap: PathToNameAndType
  singletonServicesFactories: PathToNameAndType
  sessionServicesFactories: PathToNameAndType
  configFactories: PathToNameAndType
  http: InspectorHTTPState
  functions: InspectorFunctionState
  channels: InspectorChannelState
  scheduledTasks: {
    meta: ScheduledTasksMeta
    files: Set<string>
  }
  rpc: {
    meta: Record<string, RPCMeta>
  }
}
