import { PikkuError } from '../errors/error-handler.js'
import {
  HTTPFunctionMetaInputTypes,
  PikkuHTTP,
} from '../http/http-routes.types.js'
import { PikkuHTTPAbstractRequest } from '../http/pikku-http-abstract-request.js'
import { PikkuHTTPAbstractResponse } from '../http/pikku-http-abstract-response.js'
import {
  APIDocs,
  CoreServices,
  CoreSingletonServices,
  CreateSessionServices,
  PikkuMiddleware,
} from '../types/core.types.js'
import { CoreAPIPermission } from '../types/functions.types.js'
import { PikkuRequest } from '../pikku-request.js'
import { PikkuResponse } from '../pikku-response.js'

export type RunChannelOptions = Partial<{
  skipUserSession: boolean
  respondWith404: boolean
  coerceToArray: boolean
  logWarningsForStatusCodes: number[]
  bubbleErrors: boolean
}>

export type RunChannelParams<ChannelData> = {
  channelId: string
  singletonServices: CoreSingletonServices
  request?: PikkuRequest<ChannelData> | PikkuHTTPAbstractRequest<ChannelData>
  response?: PikkuResponse | PikkuHTTPAbstractResponse
  http?: PikkuHTTP
  createSessionServices?: CreateSessionServices
}

export interface HandlerMeta {}

export interface ChannelMeta {
  name: string
  route: string
  params?: string[]
  query?: string[]
  input: string | null
  inputTypes?: HTTPFunctionMetaInputTypes
  connect: boolean
  disconnect: boolean
  message: { inputs: string[] | null; outputs: string[] | null } | null
  messageRoutes: Record<
    string,
    Record<
      string,
      {
        inputs: string[] | null
        outputs: string[] | null
      }
    >
  >
  docs?: APIDocs
  tags?: string[]
}

export type ChannelsMeta = ChannelMeta[]

export type CoreChannelConnection<
  ChannelData,
  Out = unknown,
  Services extends CoreServices = CoreServices,
> = (
  services: Services,
  channel: PikkuChannel<ChannelData, Out>
) => Promise<void>

export type CoreChannelDisconnection<
  ChannelData,
  Services extends CoreServices = CoreServices,
> = (
  services: Services,
  channel: PikkuChannel<ChannelData, never>
) => Promise<void>

/**
 * Represents a core channel function that performs an operation using core services and a user session.
 *
 * @template In - The input type.
 * @template Services - The services type, defaults to `CoreServices`.
 * @template Session - The session type, defaults to `CoreUserSession`.
 */
export type CoreChannelMessage<
  In,
  Out,
  ChannelData,
  Services extends CoreServices = CoreServices,
> = (
  services: Services,
  channel: PikkuChannel<ChannelData, Out>,
  data: In
) => Promise<void | Out>

export type CoreAPIChannelMessage<
  ChannelFunctionMessage = CoreChannelMessage<unknown, unknown, unknown>,
> = {
  func: ChannelFunctionMessage
  route: string
}

export type CoreAPIChannel<
  ChannelData,
  Channel extends string,
  ChannelFunctionConnection = CoreChannelConnection<ChannelData>,
  ChannelFunctionDisconnection = CoreChannelDisconnection<ChannelData>,
  ChannelFunctionDefaultMessage = CoreChannelMessage<unknown, unknown, unknown>,
  ChannelFunctionMessageRoute = CoreChannelMessage<unknown, unknown, unknown>,
  APIPermission = CoreAPIPermission<ChannelData>,
> = {
  name: string
  route: Channel
  onConnect?: ChannelFunctionConnection
  onDisconnect?: ChannelFunctionDisconnection
  onMessage?:
    | {
        func: ChannelFunctionDefaultMessage
        permissions?: Record<string, APIPermission[] | APIPermission>
        auth?: boolean
      }
    | ChannelFunctionDefaultMessage
  onMessageRoute?: Record<
    string,
    Record<
      string,
      | ChannelFunctionMessageRoute
      | {
          func: ChannelFunctionMessageRoute
          permissions?: Record<string, APIPermission[] | APIPermission>
          auth?: boolean
        }
    >
  >
  middleware?: PikkuMiddleware[]
  permissions?: Record<string, APIPermission[] | APIPermission>
  auth?: boolean
  docs?: Partial<{
    description: string
    response: string
    errors: Array<typeof PikkuError>
    tags: string[]
  }>
  tags?: string[]
}

export type CoreAPIChannels = CoreAPIChannel<any, string>[]

export interface PikkuChannel<OpeningData, Out> {
  // The channel identifier
  channelId: string
  // The data the channel was created with. This could be query parameters
  // or parameters in the url.
  openingData: OpeningData
  // The data to send. This will fail is the stream has been closed.
  send: (data: Out, isBinary?: boolean) => Promise<void> | void
  // This will close the channel.
  close: () => Promise<void> | void
  // The current state of the channel
  state: 'initial' | 'open' | 'closed'
}

export interface PikkuChannelHandler<OpeningData = unknown, Out = unknown> {
  send(message: Out, isBinary?: boolean): Promise<void> | void
  getChannel(): PikkuChannel<OpeningData, Out>
}

export type PikkuChannelHandlerFactory<OpeningData = unknown, Out = unknown> = (
  channelId: string,
  channelName: string,
  openingData: OpeningData
) => PikkuChannelHandler<OpeningData, Out>
