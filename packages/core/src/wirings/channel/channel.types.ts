import type {
  HTTPFunctionMetaInputTypes,
  PikkuHTTPRequest,
  PikkuHTTPResponse,
} from '../http/http.types.js'
import type {
  CorePikkuMiddleware,
  MiddlewareMetadata,
} from '../../types/core.types.js'

export type BinaryData = ArrayBuffer | Uint8Array

export type CorePikkuChannelMiddleware<Services = any, Event = unknown> = (
  services: Services,
  event: Event,
  next: (event: Event | Event[] | null) => Promise<void> | void
) => Promise<void> | void

export type CorePikkuChannelMiddlewareFactory<
  In = any,
  Services = any,
  Event = unknown,
> = (input: In) => CorePikkuChannelMiddleware<Services, Event>
import type {
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
  request?: PikkuHTTPRequest<ChannelData>
  response?: PikkuHTTPResponse
}

export interface ChannelMessageMeta {
  pikkuFuncId: string
  packageName?: string
  summary?: string
  description?: string
  errors?: string[]
  tags?: string[]
  middleware?: MiddlewareMetadata[]
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
  binary?: boolean | null
  summary?: string
  description?: string
  errors?: string[]
  tags?: string[]
  middleware?: MiddlewareMetadata[] // Pre-resolved middleware chain (tag + explicit)
  channelMiddleware?: MiddlewareMetadata[]
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
          auth?: boolean
          middleware?: PikkuMiddleware[]
        }
    >
  >
  middleware?: PikkuMiddleware[]
  channelMiddleware?: Array<
    CorePikkuChannelMiddleware | CorePikkuChannelMiddlewareFactory
  >
  auth?: boolean
  binary?: boolean | null
  onBinaryMessage?: (
    services: any,
    data: BinaryData,
    channel: PikkuChannel<ChannelData, any>
  ) => Promise<BinaryData | void> | BinaryData | void
  tags?: string[]
}

/**
 * The shape of `channel.remote` before generated types narrow it to the app's
 * own functions. Loose on purpose: core cannot know the names.
 */
export type ChannelRemote = (funcName: string, data?: any) => Promise<any>

export interface PikkuChannel<
  OpeningData,
  out Out,
  Remote extends (...args: any[]) => any = ChannelRemote,
> {
  channelId: string
  // Query parameters or url parameters the channel was created with.
  openingData: OpeningData
  // Fails once the stream has been closed.
  send(data: Out, isBinary?: boolean): Promise<void> | void
  sendBinary(data: BinaryData): Promise<void> | void
  close(): Promise<void> | void
  state: 'initial' | 'open' | 'closed'
  setState<T>(state: T): Promise<void> | void
  getState<T>(): Promise<T | undefined> | T | undefined
  clearState(): Promise<void> | void
  /**
   * Calls a function on the peer at the other end of this connection and waits
   * for its answer — the only way to reach a peer with no address of its own.
   * The peer decides what it answers to; an unregistered name is refused.
   */
  remote: Remote
}

export interface PikkuChannelHandler<OpeningData = unknown, Out = unknown> {
  send(message: Out, isBinary?: boolean): Promise<void> | void
  sendBinary(data: BinaryData): Promise<void> | void
  getChannel(): PikkuChannel<OpeningData, Out>
}

export type PikkuChannelHandlerFactory<OpeningData = unknown, Out = unknown> = (
  channelId: string,
  channelName: string,
  openingData: OpeningData
) => PikkuChannelHandler<OpeningData, Out>
