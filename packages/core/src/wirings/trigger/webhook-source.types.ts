import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { CorePikkuFunctionConfig } from '../../function/functions.types.js'
import type { HmacAlgorithm, SecretEncoding } from '../../utils/hmac.js'

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

export type WebhookSourceMethod = 'post' | 'put' | 'get' | 'head'

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
    }
  /** The provider has no API for this: `instructions` tell a person what to set by hand. */
  | { status: 'manual'; instructions: string }

export type WebhookTeardownInput = {
  label: string
  previous?: WebhookSourceState
}

export type WebhookTeardownResult = { status: 'deleted' | 'absent' }

/**
 * How a source's requests are signed. The declared forms cover a signature
 * over the raw body in one header; anything else — a timestamp in the signed
 * payload, form fields, a URL — is a function that says whether the request is
 * genuine, using the helpers in `@pikku/core/hmac`.
 */
export type WebhookVerify<Services = any> =
  | {
      hmac: {
        header: string
        /** Stripped from the header before comparing, such as `sha256=`. */
        prefix?: string
        algorithm: HmacAlgorithm
        encoding: 'hex' | 'base64'
        /** How the stored secret is encoded. Defaults to `utf8`. */
        secretEncoding?: SecretEncoding
      }
    }
  /** The provider sends the shared secret itself rather than a signature. */
  | { token: { header: string; prefix?: string } }
  /** The provider signs with a private key: the stored secret is its public key, as PEM. */
  | {
      publicKey: {
        header: string
        algorithm?: string
        dsaEncoding?: 'der' | 'ieee-p1363'
      }
    }
  | ((
      request: WebhookRequest,
      secret: string,
      services: Services
    ) => boolean | Promise<boolean>)

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
  /** What the source can produce. Each event's data is validated against its schema before it is queued. */
  events?: Events
  /** The credential holding the signing secret. Required with `verify`. */
  credential?: string
  /**
   * Checked before `receive` on every request with a body. A request is
   * refused when the credential is not set or the signature does not match.
   * A request without a body — a HEAD probe, a validation token in the query —
   * reaches `receive` unchecked, and may be answered but dispatches nothing.
   */
  verify?: WebhookVerify
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
