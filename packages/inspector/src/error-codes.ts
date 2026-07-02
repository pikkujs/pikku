/**
 * Error code system for Pikku CLI and Inspector
 *
 * Each error has a unique code and links to documentation at pikku.dev
 *
 * Error codes use random 3-digit numbers to avoid implying a sequential order.
 * Each code links to detailed documentation and troubleshooting steps.
 */

export enum ErrorCode {
  // Validation errors
  MISSING_NAME = 'PKU111',
  NON_LITERAL_WIRE_NAME = 'PKU118',
  MISSING_DESCRIPTION = 'PKU123',
  INVALID_VALUE = 'PKU124',
  MISSING_URI = 'PKU220',
  MISSING_FUNC = 'PKU236',
  INVALID_TAGS_TYPE = 'PKU247',
  INVALID_HANDLER = 'PKU300',
  MISSING_TITLE = 'PKU370',
  MISSING_QUEUE_NAME = 'PKU384',
  MISSING_CHANNEL_NAME = 'PKU400',
  CLI_CLIENTSIDE_RENDERER_HAS_SERVICES = 'PKU672',
  USER_FLOW_HAS_SERVICES = 'PKU673',
  DYNAMIC_STEP_NAME = 'PKU529',
  WORKFLOW_ORCHESTRATOR_NOT_CONFIGURED = 'PKU600',
  INVALID_DSL_WORKFLOW = 'PKU641',

  // Configuration errors
  CONFIG_TYPE_NOT_FOUND = 'PKU426',
  CONFIG_TYPE_UNDEFINED = 'PKU427',
  SCHEMA_NO_ROOT = 'PKU431',
  SCHEMA_GENERATION_ERROR = 'PKU456',
  SCHEMA_LOAD_ERROR = 'PKU488',
  INLINE_SCHEMA = 'PKU489',

  // Function errors
  FUNCTION_METADATA_NOT_FOUND = 'PKU559',
  HANDLER_NOT_RESOLVED = 'PKU568',

  // Auth errors
  DUPLICATE_AUTH_DEFINITION = 'PKU581',
  AUTH_NOT_EXPORTED = 'PKU582',

  // HTTP Route errors
  ROUTE_PARAM_MISMATCH = 'PKU571',
  ROUTE_QUERY_MISMATCH = 'PKU572',
  AUTH_DISABLED_REQUIRES_SESSIONLESS = 'PKU573',

  // Middleware/Permission errors
  MIDDLEWARE_HANDLER_INVALID = 'PKU685',
  MIDDLEWARE_TAG_INVALID = 'PKU715',
  MIDDLEWARE_EMPTY_ARRAY = 'PKU736',
  MIDDLEWARE_PATTERN_INVALID = 'PKU787',
  PERMISSION_HANDLER_INVALID = 'PKU835',
  PERMISSION_TAG_INVALID = 'PKU836',
  PERMISSION_EMPTY_ARRAY = 'PKU937',
  PERMISSION_PATTERN_INVALID = 'PKU975',

  // Versioning errors
  DUPLICATE_FUNCTION_VERSION = 'PKU850',
  DUPLICATE_FUNCTION_NAME = 'PKU851',

  // Contract versioning errors
  MANIFEST_MISSING = 'PKU860',
  FUNCTION_VERSION_MODIFIED = 'PKU861',
  CONTRACT_CHANGED_REQUIRES_BUMP = 'PKU862',
  VERSION_REGRESSION_OR_CONFLICT = 'PKU863',
  VERSION_GAP_NOT_ALLOWED = 'PKU864',
  MANIFEST_INTEGRITY_ERROR = 'PKU865',

  // Model configuration errors
  MISSING_MODEL = 'PKU145',
  INVALID_MODEL = 'PKU146',

  // File structure errors
  SCHEMA_AND_WIRING_COLOCATED = 'PKU490',

  // Optimization diagnostics
  SERVICES_NOT_DESTRUCTURED = 'PKU410',
  WIRES_NOT_DESTRUCTURED = 'PKU411',

  // Dependency integrity errors
  DUPLICATE_CORE_VERSION = 'PKU717',

  // Feature Flag
  WORKFLOW_MULTI_QUEUE_NOT_SUPPORTED = 'PKU901',

  // Data classification errors
  PII_IN_OUTPUT = 'PKU910',

  // Addon authoring errors
  ADDON_WIRING_NOT_ALLOWED = 'PKU920',
  ADDON_CONTRACT_HANDLERS_NOT_ALLOWED = 'PKU921',

  RPC_INVOCATION_TYPE_CAST = 'PKU940',
}

/**
 * Severity of a tracked, coded diagnostic. `critical` always blocks the build;
 * `error`/`warn` only block when the CLI is told to via `--fail-on-error` /
 * `--fail-on-warn` (default: critical only). All severities are still printed.
 */
export type DiagnosticSeverity = 'warn' | 'error' | 'critical'

/** A coded diagnostic emitted via `logger.diagnostic(...)`. */
export interface CodedDiagnostic {
  severity: DiagnosticSeverity
  code: ErrorCode
  message: string
}
