import { PikkuError } from '../errors/error-handler.js'
import {
  HTTPFunctionMetaInputTypes,
  PikkuHTTPRequest,
  PikkuHTTPResponse,
} from '../http/http-routes.types.js'
import {
  APIDocs,
  CoreServices,
  CoreSingletonServices,
  CreateSessionServices,
  PikkuMiddleware,
} from '../types/core.types.js'
import { CoreAPIFunction, CoreAPIPermission } from '../types/functions.types.js'

export type RunChannelOptions = Partial<{
  skipUserSession: boolean
  respondWith404: boolean
  coerceDataFromSchema: boolean
  logWarningsForStatusCodes: number[]
  bubbleErrors: boolean
}>

export type RunChannelParams<ChannelData> = {
  channelId: string
  singletonServices: CoreSingletonServices
  request?: PikkuHTTPRequest<ChannelData>
  response?: PikkuHTTPResponse
  createSessionServices?: CreateSessionServices
}

export interface ChannelMessageMeta {
  inputs: string[] | null
  outputs: string[] | null
  docs?: APIDocs
}

export interface ChannelMeta {
  name: string
  route: string
  params?: string[]
  query?: string[]
  input: string | null
  inputTypes?: HTTPFunctionMetaInputTypes
  connect: boolean
  disconnect: boolean
  message: ChannelMessageMeta | null
  messageRoutes: Record<string, Record<string, ChannelMessageMeta>>
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

export type CoreAPIChannel<
  ChannelData,
  Channel extends string,
  ChannelFunctionConnection = CoreChannelConnection<ChannelData>,
  ChannelFunctionDisconnection = CoreChannelDisconnection<ChannelData>,
  ChannelFunctionMessage = CoreAPIFunction<unknown, unknown>,
  APIPermission = CoreAPIPermission<ChannelData>,
> = {
  name: string
  route: Channel
  onConnect?: ChannelFunctionConnection
  onDisconnect?: ChannelFunctionDisconnection
  onMessage?:
    | {
        func: ChannelFunctionMessage
        permissions?: Record<string, APIPermission[] | APIPermission>
        auth?: boolean
      }
    | ChannelFunctionMessage
  onMessageRoute?: Record<
    string,
    Record<
      string,
      | ChannelFunctionMessage
      | {
          func: ChannelFunctionMessage
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
