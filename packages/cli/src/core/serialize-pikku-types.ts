/**
 *
 */
export const serializePikkuTypes = (
  userSessionTypeImport: string,
  userSessionTypeName: string,
  singletonServicesTypeImport: string,
  singletonServicesTypeName: string,
  sessionServicesTypeImport: string,
  servicesTypeName: string
) => {
  return `/**
* This is used to provide the application types in the typescript project
*/
  
import type { CoreAPIFunction, CoreAPIFunctionSessionless, CorePermissionGroup, CoreAPIPermission, PikkuMiddleware, MakeRequired } from '@pikku/core'
import { CoreHTTPFunctionRoute, AssertRouteParams, addRoute as addCoreHTTP } from '@pikku/core/http'
import { CoreScheduledTask, addScheduledTask as addCoreScheduledTask } from '@pikku/core/scheduler'
import { CoreAPIChannel, PikkuChannel, addChannel as addCoreChannel } from '@pikku/core/channel'

${userSessionTypeImport}
${singletonServicesTypeImport}
${sessionServicesTypeImport}

export type APIPermission<In = unknown, RequiredServices extends ${singletonServicesTypeName} = ${singletonServicesTypeName}> = CoreAPIPermission<In, RequiredServices, ${userSessionTypeName}>
export type APIMiddleware<RequiredServices extends ${singletonServicesTypeName} = ${singletonServicesTypeName}> = PikkuMiddleware<RequiredServices, ${userSessionTypeName}>

type APIFunctionSessionless<In = unknown, Out = never, Channel extends boolean = false, RequiredServices extends Services = Services & (Channel extends true ? { channel: PikkuChannel<unknown, Out> } : { channel?: PikkuChannel<unknown, Out> })> = CoreAPIFunctionSessionless<In, Out, Channel, RequiredServices, ${userSessionTypeName}>
type APIFunction<In = unknown, Out = never, Channel extends boolean = false, RequiredServices extends Services = Services & (Channel extends true ? { channel: PikkuChannel<unknown, Out> } : { channel?: PikkuChannel<unknown, Out> })> = CoreAPIFunction<In, Out, Channel, RequiredServices, ${userSessionTypeName}>
type APIRoute<In, Out, Route extends string> = CoreHTTPFunctionRoute<In, Out, Route, APIFunction<In, Out>, APIFunctionSessionless<In, Out>, CorePermissionGroup<APIPermission>, APIMiddleware>

export type ChannelConnection<Out = unknown, ChannelData = unknown, RequiredServices extends ${servicesTypeName} = ${servicesTypeName}> = (services: MakeRequired<RequiredServices, 'userSession'>, channel: PikkuChannel<ChannelData, Out>) => Promise<void>
export type ChannelDisconnection<ChannelData = unknown, RequiredServices extends ${servicesTypeName} = ${servicesTypeName}> = (services: MakeRequired<RequiredServices, 'userSession'>, channel: PikkuChannel<ChannelData, never>) => Promise<void>
type APIChannel<ChannelData, Channel extends string> = CoreAPIChannel<ChannelData, Channel, APIFunction<any, any, false> | APIFunction<any, any, true>, APIPermission>

type ScheduledTask = CoreScheduledTask<APIFunctionSessionless<void, void>, ${userSessionTypeName}>

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

export const pikkuChannelConnection = <In, Out = unknown>(
  func:
    | ChannelConnection<In, Out>
    | {
        func: ChannelConnection<In, Out>
        auth?: true
        name?: string
      }
    | {
        func: ChannelConnection<In, Out>
        auth: false
        name?: string
      }
) => {
   return typeof func === 'function' ? func : func.func
}

export const pikkuChannelDisconnection = <In>(
  func:
    | ChannelDisconnection<In>
    | {
        func: ChannelDisconnection<In>
        auth?: true
        name?: string
      }
    | {
        func: ChannelDisconnection<In>
        auth: false
        name?: string
      }
) => {
   return typeof func === 'function' ? func : func.func
}

export const pikkuChannelFunc = <In, Out = unknown>(
  func:
    | APIFunctionSessionless<In, Out, true>
    | {
        func: APIFunctionSessionless<In, Out, true>
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

export const addRoute = <In, Out, Route extends string>(
  route: APIRoute<In, Out, Route> & AssertRouteParams<In, Route>
) => {
  addCoreHTTP(route)
}

export const addScheduledTask = (task: ScheduledTask) => {
  addCoreScheduledTask(task as any) // TODO
}
`
}
