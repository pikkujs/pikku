import postgres from 'postgres'

/**
 * Validates that a schema name is a valid PostgreSQL identifier
 * Must start with a letter or underscore, and contain only alphanumeric characters, underscores, or dollar signs
 */
const VALID_SCHEMA_NAME = /^[a-zA-Z_][a-zA-Z0-9_$]*$/

/**
 * Validates and sanitizes a PostgreSQL schema name
 * @throws Error if schema name is invalid
 */
export function validateSchemaName(schemaName: string): void {
  if (!schemaName || typeof schemaName !== 'string') {
    throw new Error('Schema name must be a non-empty string')
  }

  if (schemaName.length > 63) {
    throw new Error('Schema name must be 63 characters or less')
  }

  if (!VALID_SCHEMA_NAME.test(schemaName)) {
    throw new Error(
      'Invalid schema name. Must start with a letter or underscore, and contain only alphanumeric characters, underscores, or dollar signs'
    )
  }
}

/**
 * Initializes the PostgreSQL schema and tables for Pikku channel storage
 *
 * @param sql - postgres.Sql connection instance
 * @param schemaName - PostgreSQL schema name to create
 */
export async function initializeSchema(
  sql: postgres.Sql,
  schemaName: string
): Promise<void> {
  validateSchemaName(schemaName)

  await sql.unsafe(`
    CREATE SCHEMA IF NOT EXISTS ${schemaName};

    CREATE TABLE IF NOT EXISTS ${schemaName}.channels (
      channel_id TEXT PRIMARY KEY,
      channel_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      opening_data JSONB NOT NULL DEFAULT '{}',
      user_session JSONB,
      last_interaction TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS ${schemaName}.channel_subscriptions (
      channel_id TEXT NOT NULL REFERENCES ${schemaName}.channels(channel_id) ON DELETE CASCADE,
      topic TEXT NOT NULL,
      PRIMARY KEY (channel_id, topic)
    );
  `)
}
