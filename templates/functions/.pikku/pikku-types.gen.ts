/**
 * This file was generated by the @pikku/cli
 */
/**
 * This is used to provide the application types in the typescript project
 */

import {
  CoreAPIFunction,
  CoreAPIFunctionSessionless,
  CoreAPIPermission,
} from '@pikku/core'
import {
  CoreHTTPFunctionRoute,
  AssertRouteParams,
  addRoute as addCoreHTTP,
} from '@pikku/core/http'
import {
  CoreScheduledTask,
  addScheduledTask as addCoreScheduledTask,
} from '@pikku/core/scheduler'
import {
  CoreAPIChannel,
  PikkuChannel,
  addChannel as addCoreChannel,
} from '@pikku/core/channel'

import type { UserSession } from '../types/application-types.d.js'
import type { Services } from '../types/application-types.d.js'

export type APIPermission<
  In = unknown,
  RequiredServices = Services,
> = CoreAPIPermission<In, RequiredServices, UserSession>

export type APIFunctionSessionless<
  In = unknown,
  Out = never,
  RequiredServices = Services,
> = CoreAPIFunctionSessionless<In, Out, RequiredServices, UserSession>
export type APIFunction<
  In = unknown,
  Out = never,
  RequiredServices = Services,
> = CoreAPIFunction<In, Out, RequiredServices, UserSession>
type APIRoute<In, Out, Route extends string> = CoreHTTPFunctionRoute<
  In,
  Out,
  Route,
  APIFunction<In, Out>,
  APIFunctionSessionless<In, Out>,
  APIPermission<In>
>

export type ChannelConnection<
  Out = unknown,
  ChannelData = unknown,
  RequiredServices extends Services = Services,
> = (
  services: RequiredServices,
  channel: PikkuChannel<UserSession, ChannelData, Out>
) => Promise<void>
export type ChannelDisconnection<
  ChannelData = unknown,
  RequiredServices extends Services = Services,
> = (
  services: RequiredServices,
  channel: PikkuChannel<UserSession, ChannelData, never>
) => Promise<void>
export type ChannelMessage<
  In,
  Out = unknown,
  ChannelData = unknown,
  RequiredServices extends Services = Services,
> = (
  services: RequiredServices,
  channel: PikkuChannel<UserSession, ChannelData, Out>,
  data: In
) => Promise<Out | void>
type APIChannel<ChannelData, Channel extends string> = CoreAPIChannel<
  ChannelData,
  Channel,
  ChannelConnection,
  ChannelDisconnection,
  ChannelMessage<any, any, ChannelData>,
  ChannelMessage<any, any, ChannelData>,
  APIPermission
>

type ScheduledTask = CoreScheduledTask<
  APIFunctionSessionless<void, void>,
  UserSession
>

export const addChannel = <ChannelData, Channel extends string>(
  channel: APIChannel<ChannelData, Channel> &
    AssertRouteParams<ChannelData, Channel>
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
