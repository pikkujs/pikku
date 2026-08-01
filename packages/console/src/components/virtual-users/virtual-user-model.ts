import {
  catalogueClassification,
  deriveCatalogue,
  deriveIntents,
  dispositionProfile,
  intentsForActor,
  isReadOnly,
  reachableCatalogue,
  type DispositionProfile,
  type IntentSource,
  type VirtualUserBudget,
  type VirtualUserDisposition,
  type VirtualUsersMeta,
} from '@pikku/core/virtual-user'
import type { FunctionsMeta } from '@pikku/core'
import type { WorkflowsMeta } from '@pikku/core/workflow'

/**
 * The reading model for a declared virtual user.
 *
 * Everything here is derived with the same functions the runner uses — the same
 * `deriveCatalogue`, the same `reachableCatalogue`, the same disposition
 * profile. The screen is therefore not a description of what a run would do, it
 * is the run's own inputs shown before it happens. A second implementation
 * would only ever be a second opinion, and the wrong one.
 */

/** Who this user signs in as, as the actor registry describes them. */
export interface VirtualUserPersona {
  key: string
  name: string
  email?: string
  jobTitle?: string
  personality?: string
}

/** What of the API this user is actually offered, and what was held back. */
export interface VirtualUserReach {
  /** Every callable RPC in the project. */
  total: number
  /** What this user is shown — the only calls it can make. */
  offered: number
  /** Of what is offered, how many change something. */
  mutations: number
  /**
   * Why entries were held back. A call can fail more than one of these, so
   * these are three independent counts and not a partition of what is missing.
   */
  withheldByApproval: number
  withheldByGrants: number
  withheldByReadOnly: number
  /** How many of the read/write decisions rest on a name, not an annotation. */
  inferred: number
  /**
   * The endpoints behind each figure, so a count can be opened rather than
   * taken on trust — and so "guessed from the name" names the functions that
   * want a `readonly` annotation instead of only counting them.
   */
  offeredNames: string[]
  mutationNames: string[]
  inferredNames: string[]
  /**
   * True when the whole surface is offered on purpose. An adversarial user is
   * shown what it is not entitled to precisely so a 2xx can be the finding —
   * which only holds as an oracle when it also declares its grants.
   */
  showsEverything: boolean
}

/**
 * What this user wants, counted.
 *
 * An app of any size gives an actor dozens of intents, and a page that prints
 * every sentence of every one is a page nobody reads to the end. The shape of
 * the wanting — how many, spread over which features — is the part worth
 * seeing at a glance; the prose is still there, one intent at a time.
 */
export interface VirtualUserWants {
  intents: number
  features: number
  steps: number
  /** Intents per feature, commonest first. Unclaimed intents are not counted. */
  byFeature: { name: string; count: number }[]
}

export interface VirtualUserDoc {
  id: string
  name: string
  description?: string
  persona: VirtualUserPersona
  disposition: VirtualUserDisposition
  /** The engine dials this disposition sets. Shown, not summarised away. */
  profile: DispositionProfile
  /** Declared wants, in the author's words. */
  goals: string[]
  /**
   * The scenarios that name this actor, as the prose the user will be handed.
   * Never their steps: finding the API is the behaviour under test.
   */
  intents: IntentSource[]
  /** The feature each intent belongs to, where one claims it. */
  featureByIntent: Record<string, string>
  /** The same intents, counted — what the summary above them reads off. */
  wants: VirtualUserWants
  tags: string[]
  budget?: VirtualUserBudget
  grants?: string[]
  fixtures?: string[]
  allowApprovalRequired: boolean
  reach: VirtualUserReach
}

export interface VirtualUserModelInput {
  virtualUsers: VirtualUsersMeta
  functions: FunctionsMeta
  workflows: WorkflowsMeta
  scenarioActors: Record<
    string,
    { name?: string; email?: string; jobTitle?: string; personality?: string }
  >
  features: Record<string, { name: string; entries?: { scenario: string }[] }>
}

export const toVirtualUserDocs = ({
  virtualUsers,
  functions,
  workflows,
  scenarioActors,
  features,
}: VirtualUserModelInput): VirtualUserDoc[] => {
  const catalogue = deriveCatalogue(functions)
  const { total, inferred } = catalogueClassification(catalogue)
  const allIntents = deriveIntents(workflows, functions)

  const featureByScenario: Record<string, string> = {}
  for (const feature of Object.values(features ?? {})) {
    for (const entry of feature.entries ?? []) {
      featureByScenario[entry.scenario] = feature.name
    }
  }

  return Object.values(virtualUsers ?? {})
    .map((user): VirtualUserDoc => {
      const profile = dispositionProfile(user.disposition)
      const actor = scenarioActors?.[user.actor]

      // An adversarial user is handed the whole surface deliberately: its
      // grants stay live as the oracle rather than as a filter.
      const showsEverything = profile.invertedOracle
      const offered = reachableCatalogue(catalogue, {
        readOnly: profile.readOnly,
        allowApprovalRequired: user.allowApprovalRequired,
        grants: profile.invertedOracle ? undefined : user.grants,
      })

      const intents = intentsForActor(allIntents, user.actor)
      const featureByIntent: Record<string, string> = {}
      const perFeature = new Map<string, number>()
      let stepCount = 0
      for (const intent of intents) {
        const feature = featureByScenario[intent.id]
        if (feature) {
          featureByIntent[intent.id] = feature
          perFeature.set(feature, (perFeature.get(feature) ?? 0) + 1)
        }
        stepCount += intent.steps?.length ?? 0
      }

      return {
        id: user.id,
        name: user.name,
        description: user.description,
        persona: {
          key: user.actor,
          name: actor?.name ?? user.actor,
          email: actor?.email,
          jobTitle: actor?.jobTitle,
          personality: actor?.personality,
        },
        disposition: user.disposition,
        profile,
        goals: user.goals ?? [],
        intents,
        featureByIntent,
        wants: {
          intents: intents.length,
          features: perFeature.size,
          steps: stepCount,
          byFeature: [...perFeature]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
        },
        tags: user.tags ?? [],
        budget: user.budget,
        grants: user.grants,
        fixtures: user.fixtures,
        allowApprovalRequired: user.allowApprovalRequired ?? false,
        reach: {
          total,
          offered: offered.length,
          mutations: offered.filter((entry) => !isReadOnly(entry)).length,
          offeredNames: offered.map((entry) => entry.name),
          mutationNames: offered
            .filter((entry) => !isReadOnly(entry))
            .map((entry) => entry.name),
          inferredNames: catalogue
            .filter((entry) => typeof entry.readonly !== 'boolean')
            .map((entry) => entry.name),
          withheldByApproval: user.allowApprovalRequired
            ? 0
            : catalogue.filter((entry) => entry.approvalRequired).length,
          withheldByGrants:
            user.grants && !profile.invertedOracle
              ? catalogue.filter(
                  (entry) =>
                    entry.permissions?.length &&
                    !entry.permissions.every((permission) =>
                      user.grants!.includes(permission)
                    )
                ).length
              : 0,
          withheldByReadOnly: profile.readOnly
            ? catalogue.filter((entry) => !isReadOnly(entry)).length
            : 0,
          inferred,
          showsEverything,
        },
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
