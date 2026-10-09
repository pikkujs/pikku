export * from './utils/precondition-error.js'
export * from './utils/output.js'
export * from './utils/git.js'
export {
  findProjectRoot,
  readJsonSafe,
  readTextSafe,
  type Finding,
} from './functions/validate/validate.js'
export {
  runProjectChecks,
  migrationHistoryErrors,
  MIGRATION_HISTORY_FINDING,
} from './functions/validate/project-checks.js'
export {
  registerChangesBackend,
  type ChangesBackend,
  type ChangesRPC,
} from './changes/context.js'
export { httpStatus } from './changes/http-status.js'
export type { ChangeEvents } from './changes/change-events.js'
export type { Declaration } from './changes/changes-local.js'
