import { PikkuError } from '../../errors/error-handler.js'
import {
  HTTPFunctionMetaInputTypes,
  PikkuHTTPRequest,
  PikkuHTTPResponse,
} from '../http/http.types.js'
import {
  PikkuDocs,
  CoreSingletonServices,
  CreateSessionServices,
  CorePikkuMiddleware,
} from '../../types/core.types.js'
import {
  CorePikkuFunction,
  CorePikkuFunctionSessionless,
  CorePikkuPermission,
} from '../../function/functions.types.js'

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
  pikkuFuncName: string
  docs?: PikkuDocs
}

export interface ChannelMeta {
  name: string
  route: string
  params?: string[]
  query?: string[]
  input: string | null
  inputTypes?: HTTPFunctionMetaInputTypes
  connect: ChannelMessageMeta | null
  disconnect: ChannelMessageMeta | null
  message: ChannelMessageMeta | null
  messageWirings: Record<string, Record<string, ChannelMessageMeta>>
  docs?: PikkuDocs
  tags?: string[]
}

export type ChannelsMeta = Record<string, ChannelMeta>

export type CoreChannel<
  ChannelData,
  Channel extends string,
  ChannelConnect =
    | CorePikkuFunction<void, unknown, ChannelData>
    | CorePikkuFunctionSessionless<void, unknown, ChannelData>,
  ChannelDisconnect =
    | CorePikkuFunction<void, void, ChannelData>
    | CorePikkuFunctionSessionless<void, void, ChannelData>,
  ChannelFunctionMessage =
    | CorePikkuFunction<unknown, unknown, ChannelData>
    | CorePikkuFunctionSessionless<unknown, unknown, ChannelData>,
  PikkuPermission = CorePikkuPermission<ChannelData>,
> = {
  name: string
  route: Channel
  onConnect?: ChannelConnect
  onDisconnect?: ChannelDisconnect
  onMessage?:
    | {
        func: ChannelFunctionMessage
        permissions?: Record<string, PikkuPermission[] | PikkuPermission>
        auth?: boolean
      }
    | ChannelFunctionMessage
  onMessageWiring?: Record<
    string,
    Record<
      string,
      | ChannelFunctionMessage
      | {
          func: ChannelFunctionMessage
          permissions?: Record<string, PikkuPermission[] | PikkuPermission>
          auth?: boolean
        }
    >
  >
  middleware?: CorePikkuMiddleware[]
  permissions?: Record<string, PikkuPermission[] | PikkuPermission>
  auth?: boolean
  docs?: Partial<{
    description: string
    response: string
    errors: Array<typeof PikkuError>
    tags: string[]
  }>
  tags?: string[]
}

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
