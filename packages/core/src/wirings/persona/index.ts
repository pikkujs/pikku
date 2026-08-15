export { definePersonas } from './define-personas.js'
export {
  isRunnablePersona,
  roleMismatchMessage,
  runnablePersonas,
  validateAndBuildPersonasMeta,
  verifyPersonaRoles,
} from './validate-personas.js'
export type { RoleVerification } from './validate-personas.js'
export {
  personaEnvironmentErrors,
  personaEnvironmentRefusal,
} from './persona-environments.js'
export type {
  PersonaEnvironment,
  PersonaEnvironmentSubject,
} from './persona-environments.js'
export { personaEmail, personaEmails } from './persona-email.js'
export type {
  MailboxAllowlist,
  PersonaMailbox,
  ReceivedEmail,
} from './persona-mailbox.js'
export type {
  CorePersona,
  CorePersonas,
  PersonaAccountMeta,
  PersonaDefinitions,
  PersonaMeta,
  PersonasMeta,
} from './persona.types.js'

/**
 * Signing in as a persona and talking to a stage over HTTP.
 *
 * Deliberately reached through this entry point rather than `@pikku/core/services`.
 * `HttpPersona` pulls in the actor-flow conversation runner and, through it, the
 * agent runner — none of which a production server has any use for. Exporting it
 * from the services barrel put that chain in the module graph of every app that
 * imports services, which only a bundler could remove and an unbundled Node or
 * Lambda deploy would load outright.
 */
export {
  HttpPersona,
  createHttpPersonas,
  type HttpPersonasConfig,
} from '../../services/http-personas.js'
export {
  postScenarioJson,
  readScenarioHttpResponse,
} from '../../services/personas-service.js'
