import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Safe } from '../../classification/secret-value.js'
import type {
  SendWebhookInput,
  SendWebhookResult,
  WebhookService,
} from '../../services/webhook-service.js'

export type CoreWebhook<
  Event extends string = string,
  Payload extends StandardSchemaV1 = StandardSchemaV1,
> = {
  event: Event
  title: string
  description?: string
  payload: Payload
}

export type WebhookDefinitionMeta = {
  event: string
  title: string
  description?: string
  payload?: Record<string, string>
  exportedName?: string
  sourceFile?: string
}

export type WebhookDefinitionsMeta = Record<string, WebhookDefinitionMeta>

export type WebhookPayloadOf<W> =
  W extends CoreWebhook<string, infer S> ? StandardSchemaV1.InferInput<S> : never

export type WebhookDataFor<TMap, Input> = Input extends {
  event: infer Event
}
  ? Event extends keyof TMap
    ? { data: Safe<TMap[Event]> }
    : unknown
  : unknown

export interface TypedWebhookService<TMap = Record<string, unknown>>
  extends Omit<WebhookService, 'send'> {
  send<const T extends SendWebhookInput>(
    input: Safe<T> & WebhookDataFor<TMap, T>
  ): Promise<SendWebhookResult>
}

export const defineWebhook = <
  const Event extends string,
  Payload extends StandardSchemaV1,
>(
  webhook: CoreWebhook<Event, Payload>
): CoreWebhook<Event, Payload> => webhook
