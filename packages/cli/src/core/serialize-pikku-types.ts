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
  
import { CoreAPIFunction, CoreAPIFunctionSessionless, CoreAPIPermission, PikkuMiddleware } from '@pikku/core'
import { CoreHTTPFunctionRoute, AssertRouteParams, addRoute as addCoreHTTP } from '@pikku/core/http'
import { CoreScheduledTask, addScheduledTask as addCoreScheduledTask } from '@pikku/core/scheduler'
import { CoreAPIChannel, PikkuChannel, addChannel as addCoreChannel } from '@pikku/core/channel'

${userSessionTypeImport}
${singletonServicesTypeImport}
${sessionServicesTypeImport}

export type APIPermission<In = unknown, RequiredServices extends ${singletonServicesTypeName} = ${singletonServicesTypeName}> = CoreAPIPermission<In, RequiredServices, ${userSessionTypeName}>
export type APIMiddleware<RequiredServices extends ${singletonServicesTypeName} = ${singletonServicesTypeName}> = PikkuMiddleware<RequiredServices, ${userSessionTypeName}>

export type APIFunctionSessionless<In = unknown, Out = never, RequiredServices extends ${servicesTypeName} = ${servicesTypeName}> = CoreAPIFunctionSessionless<In, Out, RequiredServices, ${userSessionTypeName}>
export type APIFunction<In = unknown, Out = never, RequiredServices extends ${servicesTypeName} = ${servicesTypeName}> = CoreAPIFunction<In, Out, RequiredServices, ${userSessionTypeName}>
type APIRoute<In, Out, Route extends string> = CoreHTTPFunctionRoute<In, Out, Route, APIFunction<In, Out>, APIFunctionSessionless<In, Out>, APIPermission<In>, APIMiddleware>

export type ChannelConnection<Out = unknown, ChannelData = unknown, RequiredServices extends ${servicesTypeName} = ${servicesTypeName}> = (services: RequiredServices, channel: PikkuChannel<ChannelData, Out>) => Promise<void>
export type ChannelDisconnection<ChannelData = unknown, RequiredServices extends ${servicesTypeName} = ${servicesTypeName}> = (services: RequiredServices, channel: PikkuChannel<ChannelData, never>) => Promise<void>
export type ChannelMessage<In, Out = unknown, ChannelData = unknown, RequiredServices extends ${servicesTypeName} = ${servicesTypeName}> = (services: RequiredServices, channel: PikkuChannel<ChannelData, Out>, data: In) => Promise<Out | void>
type APIChannel<ChannelData, Channel extends string> = CoreAPIChannel<ChannelData, Channel, ChannelConnection, ChannelDisconnection, ChannelMessage<any, any, ChannelData>, ChannelMessage<any, any, ChannelData>, APIPermission>

type ScheduledTask = CoreScheduledTask<APIFunctionSessionless<void, void>, ${userSessionTypeName}>

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
