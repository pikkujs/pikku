import { ChannelsMeta } from '@pikku/core/channel'
import { HTTPRoutesMeta } from '@pikku/core/http'
import { ScheduledTasksMeta } from '@pikku/core/scheduler'
import { TypesMap } from './types-map.js'

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

export type APIFunctionMeta = Array<{
  name: string
  input: string
  output: string
  file: string
}>

export type InspectorAPIFunction = {
  typesMap: TypesMap
  meta: APIFunctionMeta
}

export interface InspectorHTTPState {
  typesMap: TypesMap
  metaInputTypes: MetaInputTypes
  meta: HTTPRoutesMeta
  files: Set<string>
}

export interface InspectorChannelState {
  typesMap: TypesMap
  metaInputTypes: MetaInputTypes
  meta: ChannelsMeta
  files: Set<string>
}

export type InspectorFilters = {
  tags?: string[]
}
export interface InspectorState {
  sessionServicesTypeImportMap: PathToNameAndType
  userSessionTypeImportMap: PathToNameAndType
  singletonServicesFactories: PathToNameAndType
  sessionServicesFactories: PathToNameAndType
  configFactories: PathToNameAndType
  http: InspectorHTTPState
  channels: InspectorChannelState
  scheduledTasks: {
    meta: ScheduledTasksMeta
    files: Set<string>
  }
}
