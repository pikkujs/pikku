import type { ResolvedPersona } from '@pikku/core/services'
import type { SystemRoleDefinitionsMeta } from '@pikku/core/role'
import type { WorkflowsMeta } from '@pikku/core/workflow'
import { scopesForRoles } from '../virtual-users/virtual-user-model'
import { toEnglishName } from '../../lib/strings'
import type {
  PersonaAccountRef,
  PersonaEntry,
  PersonaRoleRef,
  PersonaScenarioRef,
} from './persona-types'

export interface PersonaModelInput {
  personas: Record<string, ResolvedPersona>
  systemRoles: SystemRoleDefinitionsMeta
  workflows: WorkflowsMeta
  features: Record<string, { name: string; entries?: { scenario: string }[] }>
}

/**
 * The reading model for the people a product is declared to be for.
 *
 * A persona is one declaration read by three surfaces — the personas page, the
 * scenario cast, the virtual user a run makes of them — so the joins live here
 * rather than in whichever screen needed them first. The role expansion is the
 * same `scopesForRoles` the virtual-user model uses, for the reason that model
 * gives: a second expansion would only ever be a second opinion.
 */

/** A scenario workflow that is a real scenario rather than a suite fixture. */
const isScenario = (workflow: any): boolean =>
  (workflow.source === 'scenario' || workflow.scenario === true) &&
  !(workflow.tags ?? []).includes('test-fixture')

const rolesFor = (
  roles: readonly string[],
  systemRoles: SystemRoleDefinitionsMeta
): PersonaRoleRef[] =>
  roles.map((name): PersonaRoleRef => {
    const declared = systemRoles?.[name]
    return {
      name,
      displayName: declared?.displayName,
      description: declared?.description,
      scopes: [...(declared?.scopes ?? [])].sort(),
      declared: declared !== undefined,
    }
  })

/**
 * A persona's logins, named.
 *
 * `account: {}` — email and password — is the normal case and carries no
 * provider, so it is still listed: "how does this person sign in" is a question
 * the profile answers, and an empty section reads as an omission.
 */
const accountsFor = (persona: ResolvedPersona): PersonaAccountRef[] => {
  const accounts: PersonaAccountRef[] = []
  if (persona.account) {
    accounts.push({ name: 'primary', ...persona.account })
  }
  for (const [name, account] of Object.entries(persona.linkedAccounts ?? {})) {
    accounts.push({ name, ...account })
  }
  return accounts
}

export const toPersonaEntries = ({
  personas,
  systemRoles,
  workflows,
  features,
}: PersonaModelInput): PersonaEntry[] => {
  const featureByScenario = new Map<string, string>()
  for (const feature of Object.values(features ?? {}) as any[]) {
    for (const entry of feature.entries ?? []) {
      featureByScenario.set(entry.scenario, feature.name)
    }
  }

  const scenariosByPersona = new Map<string, PersonaScenarioRef[]>()
  const featuresByPersona = new Map<string, Set<string>>()
  for (const workflow of Object.values(workflows ?? {}) as any[]) {
    if (!isScenario(workflow)) continue
    const feature = featureByScenario.get(workflow.name)
    for (const key of workflow.actors ?? []) {
      const cast = scenariosByPersona.get(key) ?? []
      cast.push({
        name: workflow.name,
        displayName: workflow.title ?? toEnglishName(workflow.name),
      })
      scenariosByPersona.set(key, cast)
      if (feature) {
        const owned = featuresByPersona.get(key) ?? new Set<string>()
        owned.add(feature)
        featuresByPersona.set(key, owned)
      }
    }
  }

  return Object.entries(personas ?? {})
    .map(([key, persona]): PersonaEntry => {
      const roles = persona.roles ?? []
      return {
        key,
        name: persona.name ?? key,
        email: persona.email,
        jobTitle: persona.jobTitle,
        description: persona.description,
        avatarUrl: persona.avatarUrl,
        personality: persona.personality,
        goals: persona.goals ?? [],
        tags: persona.tags ?? [],
        roles: rolesFor(roles, systemRoles),
        scopes: scopesForRoles(roles, systemRoles),
        disposition: persona.disposition,
        environments: persona.environments,
        runnable: persona.runnable !== false,
        accounts: accountsFor(persona),
        fixtures: persona.fixtures ?? [],
        sourceFile: persona.sourceFile,
        scenarios: scenariosByPersona.get(key) ?? [],
        features: [...(featuresByPersona.get(key) ?? [])].sort(),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
