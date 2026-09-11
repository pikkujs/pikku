import type { StandardSchemaV1 } from '@standard-schema/spec'

/** Events keyed by name; each value is the schema for that event's props. */
export type AnalyticsEventDefinitions = Record<string, StandardSchemaV1>

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
