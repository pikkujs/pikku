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
  tables: {
    agentThreads: {
      columns: {
        id: { type: 'string(36)', primaryKey: true },
        resourceId: { type: 'string(255)', required: true },
        title: { type: 'text' },
        metadata: { type: 'text' },
        createdAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
        updatedAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
      },
      indexes: [
        { name: 'idx_agent_threads_resource', columns: ['resourceId'] },
      ],
    },
    agentMessage: {
      columns: {
        id: { type: 'string(36)', primaryKey: true },
        threadId: {
          type: 'string(36)',
          required: true,
          references: 'agentThreads.id',
          onDelete: 'cascade',
        },
        role: { type: 'string(50)', required: true },
        content: { type: 'text' },
        createdAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
      },
      indexes: [
        {
          name: 'idx_agent_message_thread',
          columns: ['threadId', 'createdAt'],
        },
      ],
    },
    agentToolCall: {
      columns: {
        id: { type: 'string(36)', primaryKey: true },
        threadId: {
          type: 'string(36)',
          required: true,
          references: 'agentThreads.id',
          onDelete: 'cascade',
        },
        messageId: {
          type: 'string(36)',
          required: true,
          references: 'agentMessage.id',
          onDelete: 'cascade',
        },
        runId: { type: 'string(36)' },
        toolName: { type: 'string(255)', required: true },
        args: { type: 'text', required: true },
        result: { type: 'text' },
        approvalStatus: { type: 'string(50)' },
        approvalType: { type: 'string(50)' },
        agentRunId: { type: 'string(36)' },
        displayToolName: { type: 'string(255)' },
        displayArgs: { type: 'text' },
        approvalExpiresAt: { type: 'bigint' },
        createdAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
      },
      indexes: [
        { name: 'idx_agent_tool_call_thread', columns: ['threadId'] },
        { name: 'idx_agent_tool_call_message', columns: ['messageId'] },
      ],
    },
    agentWorkingMemory: {
      columns: {
        id: { type: 'string(255)', required: true },
        scope: { type: 'string(50)', required: true },
        data: { type: 'text', required: true },
        updatedAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
      },
      primaryKey: ['id', 'scope'],
    },
    agentRun: {
      columns: {
        runId: { type: 'string(36)', primaryKey: true },
        agentName: { type: 'string(255)', required: true },
        threadId: {
          type: 'string(36)',
          required: true,
          references: 'agentThreads.id',
          onDelete: 'cascade',
        },
        resourceId: { type: 'string(255)', required: true },
        status: { type: 'string(50)', required: true, default: 'running' },
        errorMessage: { type: 'text' },
        suspendReason: { type: 'text' },
        missingRpcs: { type: 'text' },
        pendingApprovals: { type: 'text' },
        usageInputTokens: { type: 'integer', required: true, default: 0 },
        usageOutputTokens: { type: 'integer', required: true, default: 0 },
        usageModel: { type: 'string(255)', required: true, default: '' },
        createdAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
        updatedAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
      },
      indexes: [
        { name: 'idx_agent_run_thread', columns: ['threadId', 'createdAt'] },
      ],
    },
    agentRunScore: {
      columns: {
        id: { type: 'string(36)', primaryKey: true },
        runId: {
          type: 'string(36)',
          required: true,
          references: 'agentRun.runId',
          onDelete: 'cascade',
        },
        scorerName: { type: 'string(255)', required: true },
        score: { type: 'real', required: true },
        reason: { type: 'text' },
        metadata: { type: 'text' },
        createdAt: {
          type: 'timestamp',
          required: true,
          default: { now: true },
        },
      },
      indexes: [
        { name: 'idx_agent_run_score_run', columns: ['runId', 'createdAt'] },
      ],
    },
  },
}
