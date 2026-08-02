import type { FunctionsMeta } from '../../types/core.types.js'
import type { WorkflowsMeta } from '../workflow/workflow.types.js'
import type { ScenarioStepPhase } from '../workflow/scenario-step.types.js'
import { composeStepProse } from '../workflow/scenario-prose.js'
import type { ApiCatalogueEntry, IntentSource } from './virtual-user.types.js'

/** A generated JSON schema, keyed by the name the function meta refers to. */
export type SchemaMap = Record<string, Record<string, unknown> | undefined>

const topLevelKeys = (
  schema: Record<string, unknown> | undefined
): string[] | undefined => {
  const properties = schema?.properties
  if (!properties || typeof properties !== 'object') return undefined
  const keys = Object.keys(properties as Record<string, unknown>)
  return keys.length ? keys : undefined
}

/**
 * Every RPC a virtual user could reach, read off the meta a project already
 * generates.
 *
 * Nothing here is new authoring, which is the whole point: the scopes, the
 * `readonly` flags, the approval gates and the schemas were written for other
 * reasons, and a virtual user is another reader of them. A project that has
 * never heard of virtual users already ships everything one needs.
 */
export const deriveCatalogue = (
  functions: FunctionsMeta,
  schemas: SchemaMap = {}
): ApiCatalogueEntry[] => {
  const entries: ApiCatalogueEntry[] = []
  for (const [name, meta] of Object.entries(functions ?? {})) {
    // Scenario bodies and their steps are never network-callable — they are
    // held out of every deployed unit — so offering one would only ever waste
    // a turn on a 404.
    //
    // For a platform or addon step this is not an efficiency argument but the
    // oracle: a virtual user's findings are worth something only because it
    // cannot manufacture the outcomes it is meant to discover. One that could
    // invoke "Stripe's webhook arrives" would forge its own payment success,
    // and every finding downstream of that is worthless. Same class of argument
    // as `allowApprovalRequired` defaulting to false — and enforced here, at
    // derivation, rather than by convention.
    if (meta.scenario || meta.scenarioStep || meta.scenarioStepKind) continue
    // `expose: true` is what puts a function on the rpc transport, and that is
    // what the shipped target calls over. Absent is not permissive: an unexposed
    // function 404s, and offering one spends a step to learn nothing about the
    // product. Measured on the e2e app, 34 of its 72 functions are in exactly
    // that state — nearly half a catalogue that cannot be called.
    if (meta.expose !== true) continue

    const inputSchema = meta.inputSchemaName
      ? schemas[meta.inputSchemaName]
      : undefined
    const outputSchema = meta.outputSchemaName
      ? schemas[meta.outputSchemaName]
      : undefined

    entries.push({
      name,
      description: meta.description ?? meta.summary ?? meta.title,
      readonly: meta.readonly,
      approvalRequired: meta.approvalRequired,
      scopes: meta.scopes?.length ? [...new Set(meta.scopes)] : undefined,
      tags: meta.tags?.length ? meta.tags : undefined,
      inputKeys: topLevelKeys(inputSchema),
      outputKeys: topLevelKeys(outputSchema),
      inputSchema,
      outputSchema,
    })
  }
  return entries
}

/** A scenario step reduced to what prose needs, whichever shape it arrived in. */
type IntentStep = {
  stepFunc: string
  phase: ScenarioStepPhase
  actor?: string
}

/**
 * The same scenario, spelled either way.
 *
 * One scenario has two meta shapes and both reach this function: the runner
 * hands over the inspector's DSL meta, where steps are a `steps[]` of
 * `scenarioStep`s, while the console reads what was written to disk through
 * `getWorkflowMeta()`, where the same steps are the graph's `nodes` and the
 * scenario declares itself with `source` rather than `scenario`. Reading only
 * the first shape is not a narrower reading — it is an empty one, and a screen
 * built on it shows every user wanting nothing at all.
 */
const scenarioSteps = (meta: {
  steps?: WorkflowsMeta[string]['steps']
  nodes?: Record<string, unknown>
}): IntentStep[] => {
  if (meta.steps?.length) {
    return meta.steps.flatMap((step) =>
      step.type === 'scenarioStep'
        ? [{ stepFunc: step.stepFunc, phase: step.phase, actor: step.actor }]
        : []
    )
  }

  // Insertion order is the order the CLI wrote the nodes in, which is the order
  // the scenario declares them. Following `next` instead would buy an ordering
  // that is already true and cost a traversal that has to decide what a branch
  // means to a reader who will never take one.
  return Object.values(meta.nodes ?? {}).flatMap((node) => {
    const { rpcName, scenarioStepPhase, actor } = (node ?? {}) as {
      rpcName?: string
      scenarioStepPhase?: ScenarioStepPhase
      actor?: string
    }
    if (!rpcName || !scenarioStepPhase) return []
    return [{ stepFunc: rpcName, phase: scenarioStepPhase, actor }]
  })
}

/**
 * The things a virtual user might want, read off the scenarios a project
 * already declares.
 *
 * Only the prose survives the trip. A scenario knows which RPCs it calls and
 * how their outputs feed each other, and none of that is passed on: finding
 * the API is the behaviour under test, and a user handed the answer tests
 * nothing. A step with no sentence to its name is dropped rather than
 * described by its function name, which would leak exactly that answer.
 */
export const deriveIntents = (
  workflows: WorkflowsMeta,
  functions: FunctionsMeta = {}
): IntentSource[] => {
  const intents: IntentSource[] = []
  for (const [name, meta] of Object.entries(workflows ?? {})) {
    if (!meta.scenario && (meta as { source?: string }).source !== 'scenario')
      continue
    // A quarantined scenario is one someone decided not to run. Driving real
    // traffic with it would be a louder version of the same mistake.
    if (meta.skip) continue

    const steps: string[] = []
    for (const step of scenarioSteps(meta)) {
      const stepMeta = functions[step.stepFunc]
      const template = stepMeta?.scenarioStepTemplate
      const description = stepMeta?.description ?? stepMeta?.summary
      if (!template && !description) continue
      steps.push(
        composeStepProse({
          phase: step.phase,
          // The template goes in unfilled, braces and all. A reporter fills its
          // placeholders from a run that happened; there is no run yet, and
          // "invites {email}" tells a user to pick someone where the filled-in
          // form would have told it whom — which is the scenario's answer, not
          // the user's own.
          description: template ?? description ?? '',
          actor: step.actor,
        })
      )
    }

    intents.push({
      id: name,
      title: meta.title ?? meta.summary ?? name,
      description: meta.description,
      steps: steps.length ? steps : undefined,
      tags: meta.tags?.length ? meta.tags : undefined,
      personas: meta.actors?.length ? meta.actors : undefined,
    })
  }
  return intents
}
