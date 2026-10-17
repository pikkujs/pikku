import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Safe } from '../../classification/secret-value.js'
import type {
  SendWebhookInput,
  SendWebhookResult,
  WebhookService,
} from '../../services/webhook-service.js'

/** An outgoing webhook event your app sends: its event name, a title and description for docs, and the schema its payload must satisfy. */
export type CoreOutgoingWebhook<
  Event extends string = string,
  Payload extends StandardSchemaV1 = StandardSchemaV1,
> = {
  event: Event
  title: string
  description?: string
  payload: Payload
}

/** Generated metadata for one outgoing webhook event. */
export type OutgoingWebhookMeta = {
  event: string
  title: string
  description?: string
  payload?: Record<string, string>
  exportedName?: string
  sourceFile?: string
}

/** Generated metadata for every outgoing webhook event, keyed by event name. */
export type OutgoingWebhooksMeta = Record<string, OutgoingWebhookMeta>

/** The payload type of an outgoing webhook, inferred from its schema's input type. */
export type OutgoingWebhookPayloadOf<W> =
  W extends CoreOutgoingWebhook<string, infer S>
    ? StandardSchemaV1.InferInput<S>
    : never

/** Resolves the `data` a {@link TypedWebhookService.send} call must carry for its `event`: the event's payload when it is a known event, unconstrained otherwise. */
export type OutgoingWebhookDataFor<TMap, Input> = Input extends {
  event: infer Event
}
  ? Event extends keyof TMap
    ? { data: Safe<TMap[Event]> }
    : unknown
  : unknown

/**
 * A `WebhookService` whose `send` checks `data` against the payload of the named event. An app's generated types supply the event-to-payload map.
 *
 * `data` must be {@link Safe}: a payload with a `SecretValue` anywhere in it
 * fails to compile rather than being sent to a third party.
 */
export interface TypedWebhookService<
  TMap = Record<string, unknown>,
> extends Omit<WebhookService, 'send'> {
  send<const T extends SendWebhookInput>(
    input: Safe<T> & OutgoingWebhookDataFor<TMap, T>
  ): Promise<SendWebhookResult>
}

/**
 * Declares an outgoing webhook event and its payload schema. Returns the definition unchanged.
 *
 * `pikku` collects these into the generated event-to-payload map, which is what
 * makes `webhookService.send({ event, data })` type-check `data` against the
 * schema. Defining an event does not send anything or register a URL.
 *
 * @param webhook - The event name, title, optional description, and payload schema.
 */
export const defineOutgoingWebhook = <
  const Event extends string,
  Payload extends StandardSchemaV1,
>(
  webhook: CoreOutgoingWebhook<Event, Payload>
): CoreOutgoingWebhook<Event, Payload> => webhook
