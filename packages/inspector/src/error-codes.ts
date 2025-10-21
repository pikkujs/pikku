/**
 * Error code system for Pikku CLI and Inspector
 *
 * Each error has a unique code and links to documentation at pikku.dev
 *
 * Error code ranges:
 * - PKU001-099: Validation errors (missing required properties, invalid types)
 * - PKU100-199: Configuration errors (missing Config type, invalid schemas)
 * - PKU200-299: Function errors (invalid functions, missing metadata)
 * - PKU300-399: Type generation errors (schema errors, import errors)
 * - PKU400-499: Runtime errors (file system, parsing errors)
 */

export enum ErrorCode {
  // Validation errors (001-099)
  MISSING_NAME = 'PKU001',
  MISSING_DESCRIPTION = 'PKU002',
  MISSING_URI = 'PKU003',
  MISSING_FUNC = 'PKU004',
  INVALID_TAGS_TYPE = 'PKU005',
  INVALID_HANDLER = 'PKU006',
  MISSING_TITLE = 'PKU007',
  MISSING_QUEUE_NAME = 'PKU008',
  MISSING_CHANNEL_NAME = 'PKU009',

  // Configuration errors (100-199)
  CONFIG_TYPE_NOT_FOUND = 'PKU100',
  CONFIG_TYPE_UNDEFINED = 'PKU101',
  SCHEMA_NO_ROOT = 'PKU102',
  SCHEMA_GENERATION_ERROR = 'PKU103',
  SCHEMA_LOAD_ERROR = 'PKU104',

  // Function errors (200-299)
  FUNCTION_METADATA_NOT_FOUND = 'PKU200',
  HANDLER_NOT_RESOLVED = 'PKU201',

  // Middleware/Permission errors (300-399)
  MIDDLEWARE_HANDLER_INVALID = 'PKU300',
  MIDDLEWARE_TAG_INVALID = 'PKU301',
  MIDDLEWARE_EMPTY_ARRAY = 'PKU302',
  MIDDLEWARE_PATTERN_INVALID = 'PKU303',
  PERMISSION_HANDLER_INVALID = 'PKU310',
  PERMISSION_TAG_INVALID = 'PKU311',
  PERMISSION_EMPTY_ARRAY = 'PKU312',
  PERMISSION_PATTERN_INVALID = 'PKU313',
}
