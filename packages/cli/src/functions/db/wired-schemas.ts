import type { InspectorState } from '@pikku/inspector'
import type { PikkuSchemaWiring } from '@pikku/kysely'

/**
 * What in a project's source implies each gated runtime schema.
 *
 * One predicate per `wiredBy` value, so the union and this map are checked
 * against each other: a schema gated on a wiring nothing here answers for would
 * never be generated, silently.
 *
 * The signals err towards including a schema. A project that declares an agent
 * but never runs one carries two unused tables; a project whose tables were
 * gated off gets a runtime failure the first time it writes a row.
 */
const SIGNALS: Record<PikkuSchemaWiring, (state: InspectorState) => boolean> = {
  agent: (state) => Object.keys(state.agents.agentsMeta).length > 0,
  channel: (state) => Object.keys(state.channels.meta).length > 0,
  scope: (state) => state.scopes.definitions.length > 0,
  /**
   * Outbound delivery is a service rather than a wiring — nothing in a project
   * declares a webhook the way it declares a channel — so what implies the
   * tables is a function asking for the service that writes rows into them.
   */
  webhook: (state) =>
    state.serviceAggregation.requiredServices.has('webhookService'),
  /**
   * Graphs count alongside DSL workflows: both run through the workflow
   * service, and a project can have only the one kind.
   */
  workflow: (state) =>
    Object.keys(state.workflows.meta).length > 0 ||
    Object.keys(state.workflows.graphMeta).length > 0,
}

/**
 * The runtime schemas a project's own source implies, for `db generate`.
 *
 * Only generation asks. Drift compares against the whole declaration, because
 * a table already in a database has to stay recognisable as a runtime table
 * after the wiring that created it is removed.
 */
export const wiredSchemasOf = (state: InspectorState): Set<PikkuSchemaWiring> =>
  new Set(
    (Object.keys(SIGNALS) as PikkuSchemaWiring[]).filter((wiring) =>
      SIGNALS[wiring](state)
    )
  )
