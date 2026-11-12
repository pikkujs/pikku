import { sql } from 'kysely'
import type { PikkuSchema } from './pikku-schema.types.js'

/**
 * Threads, messages, tool calls, working memory and agent runs.
 *
 * `agentRun` carries `pendingApprovals` even though the two services that used to
 * create this table disagreed about it: `KyselyAgentStorageService` omitted the
 * column while `KyselyAgentRunStateService` declared it and read it back through
 * casts. Whichever service happened to run first decided the shape, and on a
 * database where the storage service won, resolving an approval failed. One
 * declaration ends that — the column is here because live code reads it.
 */
export const agentSchema: PikkuSchema = {
  name: 'agent',
  ownedBy: ['agentStorage', 'agentRunState', 'agentRunService'],
  statements: [
    (db, _types, ctx) =>
      db.schema
        .createTable('agentThreads')
        .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
        .addColumn('resourceId', 'varchar(255)', (col) => col.notNull())
        .addColumn('title', ctx.text)
        .addColumn('metadata', ctx.text)
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('updatedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        ),

    (db, _types, ctx) =>
      db.schema
        .createIndex('idx_agent_threads_resource')
        .on('agentThreads')
        .column('resourceId'),

    (db, _types, ctx) =>
      db.schema
        .createTable('agentMessage')
        .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
        .addColumn('threadId', 'varchar(36)', (col) =>
          ctx.references(col.notNull(), 'agentThreads.id', 'cascade')
        )
        .addColumn('role', 'varchar(50)', (col) => col.notNull())
        .addColumn('content', ctx.text)
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .$call(
          ctx.foreignKeys('agentMessage', {
            threadId: { target: 'agentThreads.id', onDelete: 'cascade' },
          })
        ),

    (db, _types, ctx) =>
      db.schema
        .createIndex('idx_agent_message_thread')
        .on('agentMessage')
        .columns(['threadId', 'createdAt']),

    (db, _types, ctx) =>
      db.schema
        .createTable('agentToolCall')
        .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
        .addColumn('threadId', 'varchar(36)', (col) =>
          ctx.references(col.notNull(), 'agentThreads.id', 'cascade')
        )
        .addColumn('messageId', 'varchar(36)', (col) =>
          ctx.references(col.notNull(), 'agentMessage.id', 'cascade')
        )
        .addColumn('runId', 'varchar(36)')
        .addColumn('toolName', 'varchar(255)', (col) => col.notNull())
        .addColumn('args', ctx.text, (col) => col.notNull())
        .addColumn('result', ctx.text)
        .addColumn('approvalStatus', 'varchar(50)')
        .addColumn('approvalType', 'varchar(50)')
        .addColumn('agentRunId', 'varchar(36)')
        .addColumn('displayToolName', 'varchar(255)')
        .addColumn('displayArgs', ctx.text)
        .addColumn('approvalExpiresAt', 'bigint')
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .$call(
          ctx.foreignKeys('agentToolCall', {
            threadId: { target: 'agentThreads.id', onDelete: 'cascade' },
            messageId: { target: 'agentMessage.id', onDelete: 'cascade' },
          })
        ),

    (db, _types, ctx) =>
      db.schema
        .createIndex('idx_agent_tool_call_thread')
        .on('agentToolCall')
        .column('threadId'),

    (db, _types, ctx) =>
      db.schema
        .createIndex('idx_agent_tool_call_message')
        .on('agentToolCall')
        .column('messageId'),

    (db, _types, ctx) =>
      db.schema
        .createTable('agentWorkingMemory')
        .addColumn('id', 'varchar(255)', (col) => col.notNull())
        .addColumn('scope', 'varchar(50)', (col) => col.notNull())
        .addColumn('data', ctx.text, (col) => col.notNull())
        .addColumn('updatedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addPrimaryKeyConstraint('agent_working_memory_pk', ['id', 'scope']),

    (db, _types, ctx) =>
      db.schema
        .createTable('agentRun')
        .addColumn('runId', 'varchar(36)', (col) => col.primaryKey())
        .addColumn('agentName', 'varchar(255)', (col) => col.notNull())
        .addColumn('threadId', 'varchar(36)', (col) =>
          ctx.references(col.notNull(), 'agentThreads.id', 'cascade')
        )
        .addColumn('resourceId', 'varchar(255)', (col) => col.notNull())
        .addColumn('status', 'varchar(50)', (col) =>
          col.notNull().defaultTo(ctx.defaultText('running'))
        )
        .addColumn('errorMessage', ctx.text)
        .addColumn('suspendReason', ctx.text)
        .addColumn('missingRpcs', ctx.text)
        .addColumn('pendingApprovals', ctx.text)
        .addColumn('usageInputTokens', 'integer', (col) =>
          col.notNull().defaultTo(0)
        )
        .addColumn('usageOutputTokens', 'integer', (col) =>
          col.notNull().defaultTo(0)
        )
        .addColumn('usageModel', 'varchar(255)', (col) =>
          col.notNull().defaultTo(ctx.defaultText(''))
        )
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .addColumn('updatedAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .$call(
          ctx.foreignKeys('agentRun', {
            threadId: { target: 'agentThreads.id', onDelete: 'cascade' },
          })
        ),

    (db, _types, ctx) =>
      db.schema
        .createIndex('idx_agent_run_thread')
        .on('agentRun')
        .columns(['threadId', 'createdAt']),

    (db, _types, ctx) =>
      db.schema
        .createTable('agentRunScore')
        .addColumn('id', 'varchar(36)', (col) => col.primaryKey())
        .addColumn('runId', 'varchar(36)', (col) =>
          ctx.references(col.notNull(), 'agentRun.runId', 'cascade')
        )
        .addColumn('scorerName', 'varchar(255)', (col) => col.notNull())
        .addColumn('score', 'real', (col) => col.notNull())
        .addColumn('reason', ctx.text)
        .addColumn('metadata', ctx.text)
        .addColumn('createdAt', 'timestamp', (col) =>
          col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()
        )
        .$call(
          ctx.foreignKeys('agentRunScore', {
            runId: { target: 'agentRun.runId', onDelete: 'cascade' },
          })
        ),

    (db, _types, ctx) =>
      db.schema
        .createIndex('idx_agent_run_score_run')
        .on('agentRunScore')
        .columns(['runId', 'createdAt']),
  ],
}
