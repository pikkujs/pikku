import {
  CoreSingletonServices,
  CoreServices,
  CoreUserSession,
  CreateInteractionServices,
} from '@pikku/core'
import { ChannelStore } from '@pikku/core/channel'

export type WebsocketParams<
  SingletonServices extends CoreSingletonServices,
  Services extends CoreServices<SingletonServices>,
  UserSession extends CoreUserSession,
> = {
  channelStore: ChannelStore
  singletonServices: SingletonServices
  createInteractionServices?: CreateInteractionServices<
    SingletonServices,
    Services,
    UserSession
  >
}
