import {
  CoreSingletonServices,
  CoreServices,
  CoreUserSession,
  CreateWireServices,
} from '@pikku/core'
import { ChannelStore } from '@pikku/core/channel'

export type WebsocketParams<
  SingletonServices extends CoreSingletonServices,
  Services extends CoreServices<SingletonServices>,
  UserSession extends CoreUserSession,
> = {
  channelStore: ChannelStore
  singletonServices: SingletonServices
  createWireServices?: CreateWireServices<
    SingletonServices,
    Services,
    UserSession
  >
}
