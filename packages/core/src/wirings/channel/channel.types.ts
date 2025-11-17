import { PikkuError } from '../../errors/error-handler.js'
import {
  HTTPFunctionMetaInputTypes,
  PikkuHTTPRequest,
  PikkuHTTPResponse,
} from '../http/http.types.js'
import {
  PikkuDocs,
  CoreSingletonServices,
  CreateWireServices,
  CorePikkuMiddleware,
  MiddlewareMetadata,
  PermissionMetadata,
} from '../../types/core.types.js'
import {
  CorePermissionGroup,
  CorePikkuFunction,
  CorePikkuFunctionConfig,
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
  createWireServices?: CreateWireServices
}

export interface ChannelMessageMeta {
  pikkuFuncName: string
  docs?: PikkuDocs
  middleware?: MiddlewareMetadata[]
  permissions?: PermissionMetadata[]
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
  middleware?: MiddlewareMetadata[] // Pre-resolved middleware chain (tag + explicit)
  permissions?: PermissionMetadata[] // Pre-resolved permission chain (tag + explicit)
}

export type ChannelsMeta = Record<string, ChannelMeta>

export type CoreChannel<
  ChannelData,
  Channel extends string,
  ChannelConnect = CorePikkuFunctionConfig<
    | CorePikkuFunction<void, unknown>
    | CorePikkuFunctionSessionless<void, unknown>,
    CorePikkuPermission<void>,
    CorePikkuMiddleware
  >,
  ChannelDisconnect = CorePikkuFunctionConfig<
    CorePikkuFunction<void, void> | CorePikkuFunctionSessionless<void, void>,
    CorePikkuPermission<void>,
    CorePikkuMiddleware
  >,
  ChannelFunctionMessage = CorePikkuFunctionConfig<
    | CorePikkuFunction<unknown, unknown>
    | CorePikkuFunctionSessionless<unknown, unknown>,
    CorePikkuPermission<unknown>,
    CorePikkuMiddleware
  >,
  PikkuPermission = CorePikkuPermission<ChannelData>,
  PikkuMiddleware = CorePikkuMiddleware,
> = {
  name: string
  route: Channel
  onConnect?:
    | ChannelConnect
    | {
        func?: ChannelConnect
        middleware?: PikkuMiddleware[]
      }
  onDisconnect?:
    | ChannelDisconnect
    | {
        func?: ChannelDisconnect
        middleware?: PikkuMiddleware[]
      }
  onMessage?: ChannelFunctionMessage
  onMessageWiring?: Record<
    string,
    Record<
      string,
      | ChannelFunctionMessage
      | {
          func: ChannelFunctionMessage
          permissions?: CorePermissionGroup<PikkuPermission>
          auth?: boolean
          middleware?: PikkuMiddleware[]
        }
    >
  >
  middleware?: PikkuMiddleware[]
  permissions?: CorePermissionGroup<PikkuPermission>
  auth?: boolean
  docs?: Partial<{
    description: string
    response: string
    errors: Array<typeof PikkuError>
    tags: string[]
  }>
  tags?: string[]
}

export interface PikkuChannel<OpeningData, out Out> {
  // The channel identifier
  channelId: string
  // The data the channel was created with. This could be query parameters
  // or parameters in the url.
  openingData: OpeningData
  // The data to send. This will fail is the stream has been closed.
  send(data: Out, isBinary?: boolean): Promise<void> | void
  // This will close the channel.
  close(): Promise<void> | void
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
