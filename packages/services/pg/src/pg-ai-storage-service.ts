import type { AIStorageService } from '@pikku/core/services'
import type { AIThread, AIMessage } from '@pikku/core/ai-agent'
import postgres from 'postgres'
import { validateSchemaName } from './schema.js'

export class PgAIStorageService implements AIStorageService {
  private sql: postgres.Sql
  private schemaName: string
  private initialized = false
  private ownsConnection: boolean

  constructor(
    connectionOrConfig: postgres.Sql | postgres.Options<{}>,
    schemaName = 'pikku'
  ) {
    validateSchemaName(schemaName)
    this.schemaName = schemaName

    if (typeof connectionOrConfig === 'function') {
      this.sql = connectionOrConfig as postgres.Sql
      this.ownsConnection = false
    } else {
      this.sql = postgres(connectionOrConfig)
      this.ownsConnection = true
    }
  }

  public async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.sql.unsafe(`
      CREATE SCHEMA IF NOT EXISTS ${this.schemaName};

      CREATE TABLE IF NOT EXISTS ${this.schemaName}.ai_threads (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL,
        title TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_ai_threads_resource
        ON ${this.schemaName}.ai_threads (resource_id);

      CREATE TABLE IF NOT EXISTS ${this.schemaName}.ai_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES ${this.schemaName}.ai_threads(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT,
        tool_calls JSONB,
        tool_results JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_ai_messages_thread
        ON ${this.schemaName}.ai_messages (thread_id, created_at);

      CREATE TABLE IF NOT EXISTS ${this.schemaName}.ai_working_memory (
        id TEXT NOT NULL,
        scope TEXT NOT NULL,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (id, scope)
      );
    `)

    this.initialized = true
  }

  async createThread(
    resourceId: string,
    options?: {
      threadId?: string
      title?: string
      metadata?: Record<string, unknown>
    }
  ): Promise<AIThread> {
    const id = options?.threadId ?? crypto.randomUUID()
    const now = new Date()

    await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.ai_threads (id, resource_id, title, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        resourceId,
        options?.title ?? null,
        JSON.stringify(options?.metadata ?? null),
        now,
        now,
      ]
    )

    return {
      id,
      resourceId,
      title: options?.title,
      metadata: options?.metadata,
      createdAt: now,
      updatedAt: now,
    }
  }

  async getThread(threadId: string): Promise<AIThread> {
    const result = await this.sql.unsafe(
      `SELECT id, resource_id, title, metadata, created_at, updated_at
       FROM ${this.schemaName}.ai_threads
       WHERE id = $1`,
      [threadId]
    )

    if (result.length === 0) {
      throw new Error(`Thread not found: ${threadId}`)
    }

    const row = result[0]!
    return {
      id: row.id as string,
      resourceId: row.resource_id as string,
      title: row.title as string | undefined,
      metadata: row.metadata as Record<string, unknown> | undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    }
  }

  async getThreads(resourceId: string): Promise<AIThread[]> {
    const result = await this.sql.unsafe(
      `SELECT id, resource_id, title, metadata, created_at, updated_at
       FROM ${this.schemaName}.ai_threads
       WHERE resource_id = $1
       ORDER BY updated_at DESC`,
      [resourceId]
    )

    return result.map((row) => ({
      id: row.id as string,
      resourceId: row.resource_id as string,
      title: row.title as string | undefined,
      metadata: row.metadata as Record<string, unknown> | undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    }))
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.sql.unsafe(
      `DELETE FROM ${this.schemaName}.ai_threads WHERE id = $1`,
      [threadId]
    )
  }

  async getMessages(
    threadId: string,
    options?: { lastN?: number; cursor?: string }
  ): Promise<AIMessage[]> {
    let query: string
    let params: any[]

    if (options?.cursor) {
      query = `SELECT id, role, content, tool_calls, tool_results, created_at
               FROM ${this.schemaName}.ai_messages
               WHERE thread_id = $1 AND created_at < (
                 SELECT created_at FROM ${this.schemaName}.ai_messages WHERE id = $2
               )
               ORDER BY created_at DESC
               LIMIT $3`
      params = [threadId, options.cursor, options.lastN ?? 50]
    } else if (options?.lastN) {
      query = `SELECT id, role, content, tool_calls, tool_results, created_at
               FROM ${this.schemaName}.ai_messages
               WHERE thread_id = $1
               ORDER BY created_at DESC
               LIMIT $2`
      params = [threadId, options.lastN]
    } else {
      query = `SELECT id, role, content, tool_calls, tool_results, created_at
               FROM ${this.schemaName}.ai_messages
               WHERE thread_id = $1
               ORDER BY created_at ASC`
      params = [threadId]
    }

    const result = await this.sql.unsafe(query, params)

    const messages = result.map((row) => ({
      id: row.id as string,
      role: row.role as AIMessage['role'],
      content: row.content as string | undefined,
      toolCalls: row.tool_calls as AIMessage['toolCalls'],
      toolResults: row.tool_results as AIMessage['toolResults'],
      createdAt: new Date(row.created_at as string),
    }))

    if (options?.cursor || options?.lastN) {
      messages.reverse()
    }

    return messages
  }

  async saveMessages(threadId: string, messages: AIMessage[]): Promise<void> {
    if (messages.length === 0) return

    const values = messages
      .map((_, i) => {
        const base = i * 6
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`
      })
      .join(', ')

    const params = messages.flatMap((msg) => [
      msg.id,
      threadId,
      msg.role,
      msg.content ?? null,
      msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
      msg.toolResults ? JSON.stringify(msg.toolResults) : null,
    ])

    await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.ai_messages (id, thread_id, role, content, tool_calls, tool_results)
       VALUES ${values}`,
      params
    )

    await this.sql.unsafe(
      `UPDATE ${this.schemaName}.ai_threads SET updated_at = now() WHERE id = $1`,
      [threadId]
    )
  }

  async getWorkingMemory(
    id: string,
    scope: 'resource' | 'thread'
  ): Promise<Record<string, unknown> | null> {
    const result = await this.sql.unsafe(
      `SELECT data FROM ${this.schemaName}.ai_working_memory
       WHERE id = $1 AND scope = $2`,
      [id, scope]
    )

    if (result.length === 0) return null
    return result[0]!.data as Record<string, unknown>
  }

  async saveWorkingMemory(
    id: string,
    scope: 'resource' | 'thread',
    data: Record<string, unknown>
  ): Promise<void> {
    await this.sql.unsafe(
      `INSERT INTO ${this.schemaName}.ai_working_memory (id, scope, data, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (id, scope) DO UPDATE SET data = $3, updated_at = now()`,
      [id, scope, JSON.stringify(data)]
    )
  }

  public async close(): Promise<void> {
    if (this.ownsConnection) {
      await this.sql.end()
    }
  }
}
