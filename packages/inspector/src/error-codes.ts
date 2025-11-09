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
  MISSING_DESCRIPTION = 'PKU123',
  MISSING_URI = 'PKU220',
  MISSING_FUNC = 'PKU236',
  INVALID_TAGS_TYPE = 'PKU247',
  INVALID_HANDLER = 'PKU300',
  MISSING_TITLE = 'PKU370',
  MISSING_QUEUE_NAME = 'PKU384',
  MISSING_CHANNEL_NAME = 'PKU400',
  CLI_CLIENTSIDE_RENDERER_HAS_SERVICES = 'PKU672',
  DYNAMIC_STEP_NAME = 'PKU529',
  WORKFLOW_ORCHESTRATOR_NOT_CONFIGURED = 'PKU600',

  // Configuration errors
  CONFIG_TYPE_NOT_FOUND = 'PKU426',
  CONFIG_TYPE_UNDEFINED = 'PKU427',
  SCHEMA_NO_ROOT = 'PKU431',
  SCHEMA_GENERATION_ERROR = 'PKU456',
  SCHEMA_LOAD_ERROR = 'PKU488',

  // Function errors
  FUNCTION_METADATA_NOT_FOUND = 'PKU559',
  HANDLER_NOT_RESOLVED = 'PKU568',

  // Middleware/Permission errors
  MIDDLEWARE_HANDLER_INVALID = 'PKU685',
  MIDDLEWARE_TAG_INVALID = 'PKU715',
  MIDDLEWARE_EMPTY_ARRAY = 'PKU736',
  MIDDLEWARE_PATTERN_INVALID = 'PKU787',
  PERMISSION_HANDLER_INVALID = 'PKU835',
  PERMISSION_TAG_INVALID = 'PKU836',
  PERMISSION_EMPTY_ARRAY = 'PKU937',
  PERMISSION_PATTERN_INVALID = 'PKU975',

  // Feature Flag
  WORKFLOW_MULTI_QUEUE_NOT_SUPPORTED = 'PKU901',
}
