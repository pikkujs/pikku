import type { StandardSchemaV1 } from '@standard-schema/spec'

/**
 * The schema for one event's props. The generated ingest rebuilds each member
 * of the union as `z.object(schema.shape)` so it can attach the event name, so
 * a schema with no `shape` — a union, a primitive, a schema from a library
 * that does not expose one — is not something an event can be declared with,
 * and saying so here fails at the declaration rather than in generated code.
 */
export type AnalyticsEventPropsSchema = StandardSchemaV1 & {
  shape: Record<string, unknown>
}

/** Events keyed by name; each value is the schema for that event's props. */
export type AnalyticsEventDefinitions = Record<
  string,
  AnalyticsEventPropsSchema
>

/**
 * Declare what a module can measure. Call it as often as suits the project; the
 * CLI unions every declaration into the ingest schema.
 *
 * It must stay an exported const — the schema pipeline reads the value by name.
 * It registers nothing at runtime: where events go is an `AnalyticsService` on
 * singleton services.
 */
export const defineAnalyticsEvents = <
  const Events extends AnalyticsEventDefinitions,
>(
  events: Events
): Events => events
