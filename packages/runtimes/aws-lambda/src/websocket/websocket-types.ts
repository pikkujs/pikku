import {
  CoreSingletonServices,
  CoreServices,
  CoreUserSession,
  CreateSessionServices,
} from '@pikku/core'
import { ChannelStore } from '@pikku/core/channel'

export type WebsocketParams<
  SingletonServices extends CoreSingletonServices,
  Services extends CoreServices<SingletonServices>,
  UserSession extends CoreUserSession,
> = {
  channelStore: ChannelStore
  singletonServices: SingletonServices
  createSessionServices?: CreateSessionServices<
    SingletonServices,
    Services,
    UserSession
  >
}
