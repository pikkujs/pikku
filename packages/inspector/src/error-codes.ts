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
  MISSING_TITLE = 'PKU370',
  MISSING_QUEUE_NAME = 'PKU384',
  MISSING_CHANNEL_NAME = 'PKU400',
  CLI_CLIENTSIDE_RENDERER_HAS_SERVICES = 'PKU672',
  SCENARIO_HAS_SERVICES = 'PKU673',
  EXPECT_EVENTUALLY_SCENARIO_ONLY = 'PKU675',
  SCENARIO_BROWSER_STEP_NEEDS_ACTOR = 'PKU677',
  SCENARIO_STEP_TARGET_NOT_STATIC = 'PKU678',
  SCENARIO_NOT_EXTRACTABLE = 'PKU679',
  SCENARIO_HAS_NO_ASSERTION = 'PKU680',
  WORKFLOW_ORCHESTRATOR_NOT_CONFIGURED = 'PKU600',
  INVALID_DSL_WORKFLOW = 'PKU641',
  WORKFLOW_GRAPH_ADDON_NOT_WIRED = 'PKU642',
  COMPLEX_WORKFLOW_NOT_ALLOWED = 'PKU643',

  // Remote addon (wireRemoteAddon) validation
  REMOTE_ADDON_NOT_DEV_DEPENDENCY = 'PKU338',
  REMOTE_ADDON_AUTH_UNRESOLVED = 'PKU339',

  // Database schema codegen warnings
  DB_COLUMN_NAME_TYPE_CONTRADICTION = 'PKU480',
  DB_JSON_COLUMN_UNTYPED = 'PKU481',
  DB_FORMAT_ON_NON_STRING = 'PKU482',

  // Configuration errors
  SCHEMA_GENERATION_ERROR = 'PKU456',
  INLINE_SCHEMA = 'PKU489',

  // Function errors
  FUNCTION_METADATA_NOT_FOUND = 'PKU559',

  // Auth errors
  DUPLICATE_AUTH_DEFINITION = 'PKU581',
  AUTH_NOT_EXPORTED = 'PKU582',

  // Single-declaration constructs — one call site per codebase.
  // PKU583 (defineScope) and PKU584 (defineSystemRole) are retired, not free:
  // scopes and roles held this rule until the generated `admin` tree made it
  // unsatisfiable, and get it back once `admin` is a default scope nobody
  // declares. Do not reuse those two numbers for anything else.
  DUPLICATE_PERSONAS_DEFINITION = 'PKU585',

  // HTTP Route errors
  ROUTE_PARAM_MISMATCH = 'PKU571',
  ROUTE_QUERY_MISMATCH = 'PKU572',
  AUTH_DISABLED_REQUIRES_SESSIONLESS = 'PKU573',
  EXPOSED_FUNCTION_HAS_NO_GATE = 'PKU574',
  TAG_RESOLVES_TO_NO_MIDDLEWARE = 'PKU575',
  PERMISSIONS_IN_BODY_NOT_ALLOWED = 'PKU576',

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

  // Agent tool reference errors
  AGENT_TOOL_UNKNOWN_NAMESPACE = 'PKU152',
  AGENT_TOOL_NOT_FOUND = 'PKU153',
  AGENT_TOOL_MISSING_DESCRIPTION = 'PKU154',

  // File structure errors
  SCHEMA_AND_WIRING_COLOCATED = 'PKU490',

  // Optimization diagnostics
  SERVICES_NOT_DESTRUCTURED = 'PKU410',
  WIRES_NOT_DESTRUCTURED = 'PKU411',
  FUNCTION_DYNAMIC_IMPORT = 'PKU498',

  // Dependency integrity errors
  DUPLICATE_CORE_VERSION = 'PKU717',
  CORE_VERSION_SKEW = 'PKU718',

  // Data classification errors
  PII_IN_OUTPUT = 'PKU910',

  // Addon authoring errors
  ADDON_WIRING_NOT_ALLOWED = 'PKU920',
  ADDON_CONTRACT_HANDLERS_NOT_ALLOWED = 'PKU921',

  RPC_INVOCATION_TYPE_CAST = 'PKU940',

  // Secret boundary errors
  SECRET_SERVICE_ALIASED = 'PKU950',
  SECRET_NOT_DECLARED = 'PKU951',
  SECRET_KEY_NOT_STATIC = 'PKU952',
  SECRET_REVEALED_INTO_SINK = 'PKU953',
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
