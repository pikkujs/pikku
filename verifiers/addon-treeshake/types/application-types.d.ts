import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core'

export interface Config extends CoreConfig {}

export interface UserSession extends CoreUserSession {}

export interface SingletonServices extends CoreSingletonServices<Config> {
  // Parent services the function-addon declares via pikkuAddonServices —
  // the treeshake assertions check filtered units only require the ones
  // their used addon functions actually need.
  greetingStore: { greet(name: string): string }
  auditSink: { record(event: string): void }
}

export interface Services extends CoreServices<SingletonServices> {}
