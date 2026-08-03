import {
  catalogueClassification,
  deriveCatalogue,
  deriveIntents,
  dispositionProfile,
  intentsForPersona,
  isReadOnly,
  reachableCatalogue,
  unreachableCatalogue,
  type DispositionProfile,
  type IntentSource,
  type VirtualUserDisposition,
} from '@pikku/core/virtual-user'
import type { FunctionsMeta } from '@pikku/core'
import type { ResolvedPersona } from '@pikku/core/services'
import type { SystemRoleDefinitionsMeta } from '@pikku/core/role'
import type { WorkflowsMeta } from '@pikku/core/workflow'

/**
 * The reading model for a declared persona, seen as the virtual user a run
 * would make of them.
 *
 * Everything here is derived with the same functions the runner uses — the same
 * `deriveCatalogue`, the same `reachableCatalogue`, the same disposition
 * profile, the same role expansion. The screen is therefore not a description
 * of what a run would do, it is the run's own inputs shown before it happens. A
 * second implementation would only ever be a second opinion, and the wrong one.
 */

/** Who this user signs in as. */
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
  withheldByScopes: number
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
   * which only holds as an oracle because its roles say what it was entitled to.
   */
  showsEverything: boolean
}

/**
 * What this user wants, counted.
 *
 * An app of any size gives a persona dozens of intents, and a page that prints
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
  /**
   * The dials this declaration overrode, if any. The screen shows the merged
   * profile, so without this a tuned `careless` user would be indistinguishable
   * from a stock one that happens to disagree with the documentation.
   */
  tunedDials: string[]
  /** Declared wants, in the author's words. */
  goals: string[]
  /**
   * The scenarios that cast this persona, as the prose the user will be handed.
   * Never their steps: finding the API is the behaviour under test.
   */
  intents: IntentSource[]
  /** The feature each intent belongs to, where one claims it. */
  featureByIntent: Record<string, string>
  /** The same intents, counted — what the summary above them reads off. */
  wants: VirtualUserWants
  tags: string[]
  /** The roles the persona declares, and the scopes they expand to. */
  roles: string[]
  scopes: string[]
  /**
   * The environments this person named, or `undefined` for the default.
   *
   * Left unresolved on purpose. "Everywhere but production" is a fact about the
   * project's config, which this screen does not have and should not guess at —
   * and the rule itself is sayable in words, which is what the reader needs.
   */
  environments?: string[]
  fixtures?: string[]
  reach: VirtualUserReach
}

export interface VirtualUserModelInput {
  personas: Record<string, ResolvedPersona>
  systemRoles: SystemRoleDefinitionsMeta
  functions: FunctionsMeta
  workflows: WorkflowsMeta
  features: Record<string, { name: string; entries?: { scenario: string }[] }>
}

/**
 * The scopes a persona holds, resolved through its roles — the same expansion
 * the seed grants from and a run narrows the catalogue with.
 */
export const scopesForRoles = (
  roles: readonly string[],
  systemRoles: SystemRoleDefinitionsMeta
): string[] => {
  const scopes = new Set<string>()
  for (const role of roles) {
    for (const scope of systemRoles?.[role]?.scopes ?? []) {
      scopes.add(scope)
    }
  }
  return [...scopes].sort()
}

export const toVirtualUserDocs = ({
  personas,
  systemRoles,
  functions,
  workflows,
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

  return (
    Object.values(personas ?? {})
      // A persona declared `runnable: false` exists to be acted upon — banned,
      // shared with, reset — and is never handed a session of its own. Showing
      // what a run of them would look like would be describing a run that
      // cannot happen.
      .filter((persona) => persona.runnable !== false)
      .map((persona): VirtualUserDoc => {
        // Tuning is merged in here, so every figure on the screen — the move
        // percentages, the re-read rate, whether mutations are offered at all —
        // describes the run this declaration would actually produce.
        const disposition = persona.disposition ?? 'realistic'
        const profile = dispositionProfile(disposition, persona.tuning)
        const roles = persona.roles ?? []
        const scopes = scopesForRoles(roles, systemRoles)

        // An adversarial user is handed the whole surface deliberately: its
        // roles stay live as the oracle rather than as a filter.
        const showsEverything = profile.invertedOracle
        const offered = reachableCatalogue(catalogue, {
          readOnly: profile.readOnly,
          // Approval-gated calls are the ones that spend money and move real
          // traffic. They are a run flag, denied unless somebody asks, so the
          // declaration view can only ever show the default.
          allowApprovalRequired: false,
          scopes: profile.invertedOracle ? undefined : scopes,
        })

        const intents = intentsForPersona(allIntents, persona.id)
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
          id: persona.id,
          name: persona.name,
          description: persona.description,
          persona: {
            key: persona.id,
            name: persona.name,
            email: persona.email,
            jobTitle: persona.jobTitle,
            personality: persona.personality,
          },
          disposition,
          profile,
          tunedDials: Object.keys(persona.tuning ?? {}),
          goals: persona.goals ?? [],
          intents,
          featureByIntent,
          wants: {
            intents: intents.length,
            features: perFeature.size,
            steps: stepCount,
            byFeature: [...perFeature]
              .map(([name, count]) => ({ name, count }))
              .sort(
                (a, b) => b.count - a.count || a.name.localeCompare(b.name)
              ),
          },
          tags: persona.tags ?? [],
          roles,
          scopes,
          environments: persona.environments,
          fixtures: persona.fixtures,
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
            withheldByApproval: catalogue.filter(
              (entry) => entry.approvalRequired
            ).length,
            withheldByScopes: profile.invertedOracle
              ? 0
              : unreachableCatalogue(catalogue, scopes).length,
            withheldByReadOnly: profile.readOnly
              ? catalogue.filter((entry) => !isReadOnly(entry)).length
              : 0,
            inferred,
            showsEverything,
          },
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  )
}
