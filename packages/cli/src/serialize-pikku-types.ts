/**
 *
 */
export const serializePikkuTypes = (
  userSessionTypeImport: string,
  userSessionTypeName: string,
  singletonServicesTypeImport: string,
  singletonServicesTypeName: string,
  sessionServicesTypeImport: string,
  rpcMapTypeImport: string
) => {
  return `/**
* This is used to provide the application types in the typescript project
*/
  
import { CoreAPIPermission, PikkuMiddleware } from '@pikku/core'
import { CoreAPIFunction, CoreAPIFunctionSessionless } from '@pikku/core/function'
import { CoreHTTPFunctionRoute, AssertRouteParams, addHTTPRoute as addCoreHTTPRoute } from '@pikku/core/http'
import { CoreScheduledTask, addScheduledTask as addCoreScheduledTask } from '@pikku/core/scheduler'
import { CoreAPIChannel, PikkuChannel, addChannel as addCoreChannel } from '@pikku/core/channel'
import { CoreQueueWorker, addQueueWorker as addCoreQueueWorker } from '@pikku/core/queue'
import { CoreMCPEndpoint, addMCPEndpoint as addCoreMCPEndpoint } from '@pikku/core'

${userSessionTypeImport}
${singletonServicesTypeImport}
${sessionServicesTypeImport}
${rpcMapTypeImport}

export type APIPermission<In = unknown, RequiredServices extends ${singletonServicesTypeName} = ${singletonServicesTypeName}> = CoreAPIPermission<In, RequiredServices, ${userSessionTypeName}>
export type APIMiddleware<RequiredServices extends ${singletonServicesTypeName} = ${singletonServicesTypeName}> = PikkuMiddleware<RequiredServices, ${userSessionTypeName}>

type APIFunctionSessionless<
  In = unknown, 
  Out = never, 
  ChannelData = null,  // null means optional channel
  RequiredServices extends Services = Services &
    { rpc: TypedPikkuRPC } & (
    [ChannelData] extends [null] 
      ? { channel?: PikkuChannel<unknown, Out> }  // Optional channel
      : { channel: PikkuChannel<ChannelData, Out> }  // Required channel with any data type
  )
> = CoreAPIFunctionSessionless<In, Out, ChannelData, RequiredServices, ${userSessionTypeName}>

type APIFunction<
  In = unknown, 
  Out = never, 
  ChannelData = null,  // null means optional channel
  RequiredServices extends Services = Services &
    { rpc: TypedPikkuRPC } & (
    [ChannelData] extends [null] 
      ? { channel?: PikkuChannel<unknown, Out> }  // Optional channel
      : { channel: PikkuChannel<ChannelData, Out> }  // Required channel with any data type
  )
> = CoreAPIFunction<In, Out, ChannelData, RequiredServices, ${userSessionTypeName}>

type APIRoute<In, Out, Route extends string> = CoreHTTPFunctionRoute<In, Out, Route, APIFunction<In, Out>, APIFunctionSessionless<In, Out>, APIPermission<In>, APIMiddleware>
type APIChannel<ChannelData, Channel extends string> = CoreAPIChannel<ChannelData, Channel, APIFunction<void, unknown> | APIFunction<void, unknown, ChannelData>, APIFunction<void, void> | APIFunction<void, void, ChannelData>, APIFunction<any, any> | APIFunction<any, any, ChannelData>, APIPermission>
type ScheduledTask = CoreScheduledTask<APIFunctionSessionless<void, void>, ${userSessionTypeName}>
type QueueWorker<In, Out> = CoreQueueWorker<APIFunctionSessionless<In, Out>>
type MCPEndpoint<In, Out> = CoreMCPEndpoint<APIFunctionSessionless<In, Out>>

export const pikkuFunc = <In, Out = unknown>(
  func:
    | APIFunction<In, Out>
    | {
        func: APIFunction<In, Out>
        auth?: true
        name?: string
      }
    | {
        func: APIFunctionSessionless<In, Out>
        auth: false
        name?: string
      }
) => {
  return typeof func === 'function' ? func : func.func
}

export const pikkuSessionlessFunc = <In, Out = unknown>(
  func:
    | APIFunctionSessionless<In, Out>
    | {
        func: APIFunctionSessionless<In, Out>
        name?: string
      }
) => {
  return typeof func === 'function' ? func : func.func
}

export const pikkuChannelConnectionFunc = <Out = unknown, ChannelData = unknown>(
  func:
    | APIFunctionSessionless<void, Out, ChannelData>
    | {
        func: APIFunctionSessionless<void, Out, ChannelData>
        name?: string
      }
) => {
  return typeof func === 'function' ? func : func.func
}

export const pikkuChannelDisconnectionFunc = <ChannelData = unknown>(
  func:
    | APIFunctionSessionless<void, void, ChannelData>
    | {
        func: APIFunction<void, void, ChannelData>
        name?: string
      }
) => {
  return typeof func === 'function' ? func : func.func
}

export const pikkuChannelFunc = <In = unknown, Out = unknown, ChannelData = unknown>(
  func:
    | APIFunctionSessionless<In, Out, ChannelData>
    | {
        func: APIFunctionSessionless<In, Out, ChannelData>
        name?: string
      }
) => {
  return typeof func === 'function' ? func : func.func
}

export const pikkuVoidFunc = (
  func:
    | APIFunctionSessionless<void, void>
    | {
        func: APIFunctionSessionless<void, void>
        name?: string
      }
) => {
  return typeof func === 'function' ? func : func.func
}
   
export const addChannel = <ChannelData, Channel extends string>(
  channel: APIChannel<ChannelData, Channel> & AssertRouteParams<ChannelData, Channel>
) => {
  addCoreChannel(channel as any) // TODO
}

export const addHTTPRoute = <In, Out, Route extends string>(
  route: APIRoute<In, Out, Route> & AssertRouteParams<In, Route>
) => {
  addCoreHTTPRoute(route)
}

export const addScheduledTask = (task: ScheduledTask) => {
  addCoreScheduledTask(task as any) // TODO
}

export const addQueueWorker = (queueWorker: QueueWorker<any, any>) => {
  addCoreQueueWorker(queueWorker as any) // TODO
}

export const addMCPEndpoint = <In, Out>(
  mcpEndpoint: MCPEndpoint<In, Out>
) => {
  addCoreMCPEndpoint(mcpEndpoint as any)
}
`
}
