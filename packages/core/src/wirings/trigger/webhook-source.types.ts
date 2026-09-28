import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { CorePikkuFunctionConfig } from '../../function/functions.types.js'

export const PIKKU_INCOMING_WEBHOOK_QUEUE_NAME = 'pikku-incoming-webhooks'

/** What every trigger source produces, whichever way it arrives. */
export type TriggerEvent<Name extends string = string, Data = unknown> = {
  /** The provider's event type; dispatched to the trigger named `<source>:<name>`. Empty dispatches to `<source>`. */
  name: Name
  /** The provider's event id, which de-duplicates redeliveries. */
  id?: string
  data: Data
}

/** The request exactly as it arrived: providers sign the raw bytes, not re-serialised JSON. */
export type WebhookRequest = {
  body: Uint8Array
  headers: Record<string, string>
  method: string
  url: string
  query: Record<string, string>
}

export type WebhookReceiveResult =
  | { events: TriggerEvent[] }
  /** A handshake, such as Slack's `url_verification`: answered directly, nothing is dispatched. */
  | {
      respond: {
        status: number
        body?: unknown
        headers?: Record<string, string>
      }
    }

export type WebhookSourceMethod = 'post' | 'put' | 'get'

/** Whatever `setup` wants back on the next deploy, for providers whose endpoints cannot be found by label. */
export type WebhookSourceState = Record<string, unknown>

export type WebhookLifecycleInput = {
  /** Always this deployment's own route: nothing can point it elsewhere. */
  url: string
  /** Stable across deploys of one app and stage, for providers that let endpoints be tagged and listed. */
  label: string
  /** The declared events some trigger is wired to. */
  events: string[]
  previous?: WebhookSourceState
}

export type WebhookCheckResult =
  | { status: 'ok' }
  | { status: 'missing' }
  | { status: 'drifted'; reason: string }

export type WebhookSetupResult =
  | {
      status: 'created' | 'updated' | 'unchanged'
      state?: WebhookSourceState
      /** Only when the provider issued a new signing secret. */
      secret?: string
    }
  /** The provider has no API for this: `instructions` tell a person what to set by hand. */
  | { status: 'manual'; instructions: string }

export type WebhookTeardownInput = {
  label: string
  previous?: WebhookSourceState
}

export type WebhookTeardownResult = { status: 'deleted' | 'absent' }

type SourceFunction<In, Out> = CorePikkuFunctionConfig<any, any> & {
  func: (services: any, data: In, wire: any) => Promise<Out>
}

export type CoreTriggerWebhookSource<
  Events extends Record<string, StandardSchemaV1> = Record<
    string,
    StandardSchemaV1
  >,
> = {
  /** Triggers subscribe to `<name>:<event>`. Unique across every kind of trigger source. */
  name: string
  /** Several for providers that verify the URL with a GET and deliver with a POST. */
  method?: WebhookSourceMethod | WebhookSourceMethod[]
  /** Defaults to `/webhooks/<name>`. */
  route?: string
  /** The secret `receive` verifies with, which `setup` produces. */
  secret?: string
  /** What the source can produce. Each event's data is validated against its schema before it is queued. */
  events?: Events
  /** Omitted: the JSON body is one event dispatched to the trigger named `<name>`. */
  receive?: SourceFunction<WebhookRequest, WebhookReceiveResult>
  check?: SourceFunction<WebhookLifecycleInput, WebhookCheckResult>
  setup?: SourceFunction<WebhookLifecycleInput, WebhookSetupResult>
  teardown?: SourceFunction<WebhookTeardownInput, WebhookTeardownResult>
}

export type WebhookSourceMeta = {
  name: string
  method: WebhookSourceMethod | WebhookSourceMethod[]
  route: string
  secret?: string
  events: string[]
  receive?: string
  check?: string
  setup?: string
  teardown?: string
}

export type WebhookSourcesMeta = Record<string, WebhookSourceMeta>

/** One queued event on its way to its trigger. */
export type WebhookSourceJob = {
  source: string
  event: TriggerEvent
  /** Present when a store-backed service recorded the receipt. */
  receiptId?: string
}
