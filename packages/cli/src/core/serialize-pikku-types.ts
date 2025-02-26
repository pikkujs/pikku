/**
 *
 */
export const serializePikkuTypes = (
  userSessionTypeImport: string,
  userSessionTypeName: string,
  sessionServicesTypeImport: string,
  servicesTypeName: string
) => {
  return `/**
* This is used to provide the application types in the typescript project
*/
  
import { CoreAPIFunction, CoreAPIFunctionSessionless, CoreAPIPermission, MakeRequired } from '@pikku/core'
import { CoreHTTPFunctionRoute, AssertRouteParams, addRoute as addCoreHTTP } from '@pikku/core/http'
import { CoreScheduledTask, addScheduledTask as addCoreScheduledTask } from '@pikku/core/scheduler'
import { CoreAPIChannel, PikkuChannel, addChannel as addCoreChannel } from '@pikku/core/channel'

${userSessionTypeImport}
${sessionServicesTypeImport}

export type APIPermission<In = unknown, RequiredServices = ${servicesTypeName}> = CoreAPIPermission<In, RequiredServices, ${userSessionTypeName}>

export type APIFunctionSessionless<In = unknown, Out = never, RequiredServices = ${servicesTypeName}> = CoreAPIFunctionSessionless<In, Out, RequiredServices, ${userSessionTypeName}>
export type APIFunction<In = unknown, Out = never, RequiredServices = ${servicesTypeName}> = CoreAPIFunction<In, Out, RequiredServices, ${userSessionTypeName}>
type APIRoute<In, Out, Route extends string> = CoreHTTPFunctionRoute<In, Out, Route, APIFunction<In, Out>, APIFunctionSessionless<In, Out>, APIPermission<In>>

export type ChannelConnection<Out = never, ChannelData = unknown, RequiredServices extends ${servicesTypeName} = ${servicesTypeName}> = (services: RequiredServices, channel: PikkuChannel<${userSessionTypeName}, ChannelData, Out>) => Promise<void>
export type ChannelDisconnection<ChannelData = unknown, RequiredServices extends ${servicesTypeName} = ${servicesTypeName}> = (services: RequiredServices, channel: PikkuChannel<${userSessionTypeName}, ChannelData, never>) => Promise<void>
export type ChannelMessage<In, Out = never, ChannelData = unknown, RequiredServices extends ${servicesTypeName} = ${servicesTypeName}> = (services: RequiredServices 'eventHub'>, channel: PikkuChannel<${userSessionTypeName}, ChannelData, Out>, data: In) => Promise<Out | void>
type APIChannel<ChannelData, Channel extends string, In extends unknown = never, Out extends unknown = never> = CoreAPIChannel<ChannelData, Channel, ChannelConnection, ChannelDisconnection, ChannelMessage<In, Out, ChannelData>>

type ScheduledTask = CoreScheduledTask<APIFunctionSessionless<void, void>, ${userSessionTypeName}>

export const addChannel = <ChannelData, Channel extends string>(
  channel: APIChannel<ChannelData, Channel> & AssertRouteParams<ChannelData, Channel>
) => {
  addCoreChannel(channel)
}

export const addRoute = <In, Out, Route extends string>(
  route: APIRoute<In, Out, Route> & AssertRouteParams<In, Route>
) => {
  addCoreHTTP(route)
}

export const addScheduledTask = (task: ScheduledTask) => {
  addCoreScheduledTask(task)
}
`
}
