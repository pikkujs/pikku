import type { StandardSchemaV1 } from '@standard-schema/spec'

/**
 * The events one module declares, keyed by event name.
 *
 * Each value is the schema for that event's props — the name is the key, so it
 * is never repeated as a `z.literal` inside the object.
 */
export type AnalyticsEventDefinitions = Record<string, StandardSchemaV1>

/**
 * Declare what this module can measure.
 *
 * The declaration is the input schema of the generated `POST /analytics`
 * ingest and of `services.analytics.record()`, which is what makes it more than
 * documentation: a name it does not declare fails to compile at the call site
 * and is rejected at the wire, rather than quietly becoming a second series
 * that fragments the dashboard.
 *
 * Declare as many times as suits the project — a feature module can declare its
 * own events beside its own functions, and the CLI unions them. It stays an
 * exported const because the schema pipeline reads the value by name when it
 * converts the events to JSON Schema.
 *
 * This registers nothing at runtime. Where events go is an
 * {@link AnalyticsService} on singleton services, not a property of the
 * declaration, so a platform can supply one without touching a file the app
 * owns.
 */
export const defineAnalyticsEvents = <
  const Events extends AnalyticsEventDefinitions,
>(
  events: Events
): Events => events
