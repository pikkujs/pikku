import { sql } from 'kysely'
import type { PikkuSchema } from './pikku-schema.types.js'

/**
 * Threads, messages, tool calls, working memory and agent runs.
 *
 * `aiRun` carries `pendingApprovals` even though the two services that used to
 * create this table disagreed about it: `KyselyAIStorageService` omitted the
 * column while `KyselyAIRunStateService` declared it and read it back through
 * casts. Whichever service happened to run first decided the shape, and on a
 * database where the storage service won, resolving an approval failed. One
 * declaration ends that — the column is here because live code reads it.
 */
export const aiSchema: PikkuSchema = {
  name: 'ai',
  statements: [
    (db) =>
      db.schema
        .createTable('aiThreads')
        .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
        .addColumn('resourceId', 'varchar(255)', (col) => col.notNull())
        .addColumn('title', 'text')
        .addColumn('metadata', 'text')
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('updatedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),

    (db) =>
      db.schema
        .createIndex('idx_ai_threads_resource')
        .on('aiThreads')
        .column('resourceId'),

    (db) =>
      db.schema
        .createTable('aiMessage')
        .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
        .addColumn('threadId', 'varchar(36)', (col) =>
          col.notNull().references('aiThreads.id').onDelete('cascade')
        )
        .addColumn('role', 'varchar(50)', (col) => col.notNull())
        .addColumn('content', 'text')
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),

    (db) =>
      db.schema
        .createIndex('idx_ai_message_thread')
        .on('aiMessage')
        .columns(['threadId', 'createdAt']),

    (db) =>
      db.schema
        .createTable('aiToolCall')
        .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
        .addColumn('threadId', 'varchar(36)', (col) =>
          col.notNull().references('aiThreads.id').onDelete('cascade')
        )
        .addColumn('messageId', 'varchar(36)', (col) =>
          col.notNull().references('aiMessage.id').onDelete('cascade')
        )
        .addColumn('runId', 'varchar(36)')
        .addColumn('toolName', 'varchar(255)', (col) => col.notNull())
        .addColumn('args', 'text', (col) => col.notNull())
        .addColumn('result', 'text')
        .addColumn('approvalStatus', 'varchar(50)')
        .addColumn('approvalType', 'varchar(50)')
        .addColumn('agentRunId', 'varchar(36)')
        .addColumn('displayToolName', 'varchar(255)')
        .addColumn('displayArgs', 'text')
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),

    (db) =>
      db.schema
        .createIndex('idx_ai_tool_call_thread')
        .on('aiToolCall')
        .column('threadId'),

    (db) =>
      db.schema
        .createIndex('idx_ai_tool_call_message')
        .on('aiToolCall')
        .column('messageId'),

    (db) =>
      db.schema
        .createTable('aiWorkingMemory')
        .addColumn('id', 'varchar(255)', (col) => col.notNull())
        .addColumn('scope', 'varchar(50)', (col) => col.notNull())
        .addColumn('data', 'text', (col) => col.notNull())
        .addColumn('updatedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addPrimaryKeyConstraint('ai_working_memory_pk', ['id', 'scope']),

    (db) =>
      db.schema
        .createTable('aiRun')
        .addColumn('runId', 'varchar(36)', (col) => col.primaryKey())
        .addColumn('agentName', 'varchar(255)', (col) => col.notNull())
        .addColumn('threadId', 'varchar(36)', (col) =>
          col.notNull().references('aiThreads.id').onDelete('cascade')
        )
        .addColumn('resourceId', 'varchar(255)', (col) => col.notNull())
        .addColumn('status', 'varchar(50)', (col) =>
          col.notNull().defaultTo('running')
        )
        .addColumn('errorMessage', 'text')
        .addColumn('suspendReason', 'text')
        .addColumn('missingRpcs', 'text')
        .addColumn('pendingApprovals', 'text')
        .addColumn('usageInputTokens', 'integer', (col) =>
          col.notNull().defaultTo(0)
        )
        .addColumn('usageOutputTokens', 'integer', (col) =>
          col.notNull().defaultTo(0)
        )
        .addColumn('usageModel', 'varchar(255)', (col) =>
          col.notNull().defaultTo('')
        )
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('updatedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),

    (db) =>
      db.schema
        .createIndex('idx_ai_run_thread')
        .on('aiRun')
        .columns(['threadId', 'createdAt']),

    (db) =>
      db.schema
        .createTable('aiRunScore')
        .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
        .addColumn('runId', 'varchar(36)', (col) =>
          col.notNull().references('aiRun.runId').onDelete('cascade')
        )
        .addColumn('scorerName', 'varchar(255)', (col) => col.notNull())
        .addColumn('score', 'real', (col) => col.notNull())
        .addColumn('reason', 'text')
        .addColumn('metadata', 'text')
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),

    (db) =>
      db.schema
        .createIndex('idx_ai_run_score_run')
        .on('aiRunScore')
        .columns(['runId', 'createdAt']),
  ],
}
