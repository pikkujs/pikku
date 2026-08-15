export { HttpPersona, createHttpPersonas } from '../services/http-personas.js'
export type { HttpPersonasConfig } from '../services/http-personas.js'
export { personaEmails } from '../wirings/persona/persona-email.js'
export {
  personaEnvironmentErrors,
  personaEnvironmentRefusal,
} from '../wirings/persona/persona-environments.js'
export type {
  CorePersona,
  PersonaAccountMeta,
  PersonaDefinitions,
  PersonaMeta,
} from '../wirings/persona/persona.types.js'
export {
  isRunnablePersona,
  roleMismatchMessage,
  validateAndBuildPersonasMeta,
  verifyPersonaRoles,
} from '../wirings/persona/validate-personas.js'

/**
 * Types the exports above mention but do not themselves export. Without
 * them a consumer's declaration emit has no name for the type it infers,
 * and fails with TS2883 rather than reaching for the original entry point.
 */
export type { ScenarioPersonas } from '../services/personas-service.js'
export type {
  PersonaEnvironment,
  PersonaEnvironmentSubject,
} from '../wirings/persona/persona-environments.js'
export type { PersonasMeta } from '../wirings/persona/persona.types.js'
export type { RoleVerification } from '../wirings/persona/validate-personas.js'
