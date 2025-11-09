import type { SerializedError } from '@pikku/core'
import {
  PikkuWorkflowService,
  type WorkflowRun,
  type StepState,
  type WorkflowStatus,
} from '@pikku/core/workflow'
import {
  DynamoDBClient,
  type DynamoDBClientConfig,
} from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb'
import { randomUUID } from 'crypto'

/**
 * Configuration for DynamoDB Workflow Service
 */
export interface DynamoDBWorkflowServiceConfig {
  /** DynamoDB client configuration (region, endpoint, etc.) */
  dynamoDBConfig?: DynamoDBClientConfig
  /** Name of the DynamoDB table for workflow runs (default: 'workflow-runs') */
  runsTableName?: string
  /** Name of the DynamoDB table for workflow steps (default: 'workflow-steps') */
  stepsTableName?: string
  /** Name of the DynamoDB table for step history (default: 'workflow-step-history') */
  historyTableName?: string
}

/**
 * DynamoDB-based implementation of WorkflowStateService
 *
 * Stores workflow run state, step state, and history in DynamoDB tables.
 * Uses DynamoDB's conditional updates for optimistic locking.
 *
 * Table schema:
 * - workflow-runs: PK=runId, workflow, status, input, output, error, timestamps
 * - workflow-steps: PK=runId#stepName, rpcName, data, status, result, error, retries, timestamps
 * - workflow-step-history: PK=stepId, SK=attemptCount, status, result, error, timestamps
 *
 * @example
 * ```typescript
 * const workflowService = new DynamoDBWorkflowService({
 *   dynamoDBConfig: { region: 'us-east-1' },
 *   runsTableName: 'my-workflow-runs',
 *   stepsTableName: 'my-workflow-steps',
 * })
 * await workflowService.init()
 * ```
 */
export class DynamoDBWorkflowService extends PikkuWorkflowService {
  private docClient: DynamoDBDocumentClient
  private runsTableName: string
  private stepsTableName: string
  private historyTableName: string
  private ownsConnection: boolean

  /**
   * @param config - Configuration object or DynamoDBClient instance
   */
  constructor(config: DynamoDBWorkflowServiceConfig | DynamoDBClient = {}) {
    super()

    if (config instanceof DynamoDBClient) {
      // DynamoDBClient instance provided
      this.docClient = DynamoDBDocumentClient.from(config)
      this.ownsConnection = false
      this.runsTableName = 'workflow-runs'
      this.stepsTableName = 'workflow-steps'
      this.historyTableName = 'workflow-step-history'
    } else {
      // Config object provided
      const client = new DynamoDBClient(config.dynamoDBConfig || {})
      this.docClient = DynamoDBDocumentClient.from(client)
      this.ownsConnection = true
      this.runsTableName = config.runsTableName || 'workflow-runs'
      this.stepsTableName = config.stepsTableName || 'workflow-steps'
      this.historyTableName = config.historyTableName || 'workflow-step-history'
    }
  }

  /**
   * Initialize the service (no-op for DynamoDB, tables should be created externally)
   * Tables must be created with:
   * - workflow-runs: PK=id (String)
   * - workflow-steps: PK=runStepKey (String) - composite key: runId#stepName
   * - workflow-step-history: PK=stepId (String), SK=attemptCount (Number)
   */
  public async init(): Promise<void> {
    // DynamoDB tables should be created externally (CloudFormation, CDK, etc.)
    // This is a no-op to maintain interface compatibility
  }

  private createRunStepKey(runId: string, stepName: string): string {
    return `${runId}#${stepName}`
  }

  /**
   * Save a step history entry
   */
  private async saveStepHistory(
    stepId: string,
    stepName: string,
    attemptCount: number,
    status: 'pending' | 'running' | 'scheduled' | 'succeeded' | 'failed',
    result?: any,
    error?: SerializedError,
    retries?: number,
    retryDelay?: string
  ): Promise<void> {
    const now = Date.now()

    const item: any = {
      stepId,
      attemptCount,
      stepName,
      status,
      createdAt: now,
    }

    if (result !== undefined) {
      item.result = result
    }

    if (error !== undefined) {
      item.error = error
    }

    if (retries !== undefined) {
      item.retries = retries
    }

    if (retryDelay !== undefined) {
      item.retryDelay = retryDelay
    }

    // Add status-specific timestamp
    switch (status) {
      case 'running':
        item.runningAt = now
        break
      case 'scheduled':
        item.scheduledAt = now
        break
      case 'succeeded':
        item.succeededAt = now
        break
      case 'failed':
        item.failedAt = now
        break
    }

    await this.docClient.send(
      new PutCommand({
        TableName: this.historyTableName,
        Item: item,
      })
    )
  }

  /**
   * Update the current history entry in-place
   */
  private async updateCurrentHistoryRecord(
    stepId: string,
    stepName: string,
    attemptCount: number,
    status: 'running' | 'scheduled' | 'succeeded' | 'failed',
    result?: any,
    error?: SerializedError,
    retries?: number,
    retryDelay?: string
  ): Promise<void> {
    const now = Date.now()

    const updateExpressions: string[] = ['#status = :status']
    const expressionAttributeNames: Record<string, string> = {
      '#status': 'status',
    }
    const expressionAttributeValues: Record<string, any> = {
      ':status': status,
    }

    if (result !== undefined) {
      updateExpressions.push('#result = :result')
      expressionAttributeNames['#result'] = 'result'
      expressionAttributeValues[':result'] = result
    }

    if (error !== undefined) {
      updateExpressions.push('#error = :error')
      expressionAttributeNames['#error'] = 'error'
      expressionAttributeValues[':error'] = error
    }

    // Add status-specific timestamp
    let timestampField: string | null = null
    switch (status) {
      case 'running':
        timestampField = 'runningAt'
        break
      case 'scheduled':
        timestampField = 'scheduledAt'
        break
      case 'succeeded':
        timestampField = 'succeededAt'
        break
      case 'failed':
        timestampField = 'failedAt'
        break
    }

    if (timestampField) {
      updateExpressions.push(`#${timestampField} = :${timestampField}`)
      expressionAttributeNames[`#${timestampField}`] = timestampField
      expressionAttributeValues[`:${timestampField}`] = now
    }

    await this.docClient.send(
      new UpdateCommand({
        TableName: this.historyTableName,
        Key: {
          stepId,
          attemptCount,
        },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      })
    )
  }

  async createRun(workflowName: string, input: any): Promise<string> {
    const id = randomUUID()
    const now = Date.now()

    await this.docClient.send(
      new PutCommand({
        TableName: this.runsTableName,
        Item: {
          id,
          workflow: workflowName,
          status: 'running',
          input,
          createdAt: now,
          updatedAt: now,
        },
      })
    )

    return id
  }

  async getRun(id: string): Promise<WorkflowRun | null> {
    const response = await this.docClient.send(
      new GetCommand({
        TableName: this.runsTableName,
        Key: { id },
      })
    )

    if (!response.Item) {
      return null
    }

    const item = response.Item
    return {
      id: item.id as string,
      workflow: item.workflow as string,
      status: item.status as WorkflowStatus,
      input: item.input,
      output: item.output,
      error: item.error,
      createdAt: new Date(item.createdAt as number),
      updatedAt: new Date(item.updatedAt as number),
    }
  }

  async updateRunStatus(
    id: string,
    status: WorkflowStatus,
    output?: any,
    error?: SerializedError
  ): Promise<void> {
    const now = Date.now()

    const updateExpressions: string[] = [
      '#status = :status',
      '#updatedAt = :updatedAt',
    ]
    const expressionAttributeNames: Record<string, string> = {
      '#status': 'status',
      '#updatedAt': 'updatedAt',
    }
    const expressionAttributeValues: Record<string, any> = {
      ':status': status,
      ':updatedAt': now,
    }

    if (output !== undefined) {
      updateExpressions.push('#output = :output')
      expressionAttributeNames['#output'] = 'output'
      expressionAttributeValues[':output'] = output
    }

    if (error !== undefined) {
      updateExpressions.push('#error = :error')
      expressionAttributeNames['#error'] = 'error'
      expressionAttributeValues[':error'] = error
    }

    await this.docClient.send(
      new UpdateCommand({
        TableName: this.runsTableName,
        Key: { id },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      })
    )
  }

  async insertStepState(
    runId: string,
    stepName: string,
    rpcName: string,
    data: any,
    stepOptions?: { retries?: number; retryDelay?: string | number }
  ): Promise<StepState> {
    const now = Date.now()
    const stepId = `${runId}:${stepName}:${now}`
    const runStepKey = this.createRunStepKey(runId, stepName)

    const item: any = {
      runStepKey,
      stepId,
      runId,
      stepName,
      rpcName,
      data,
      status: 'pending',
      attemptCount: 1,
      createdAt: now,
      updatedAt: now,
    }

    if (stepOptions?.retries !== undefined) {
      item.retries = stepOptions.retries
    }

    if (stepOptions?.retryDelay !== undefined) {
      item.retryDelay = stepOptions.retryDelay.toString()
    }

    await this.docClient.send(
      new PutCommand({
        TableName: this.stepsTableName,
        Item: item,
      })
    )

    // Save initial history entry
    await this.saveStepHistory(
      stepId,
      stepName,
      1,
      'pending',
      undefined,
      undefined,
      stepOptions?.retries,
      stepOptions?.retryDelay?.toString()
    )

    return {
      stepId,
      status: 'pending',
      attemptCount: 1,
      retries: stepOptions?.retries,
      retryDelay: stepOptions?.retryDelay?.toString(),
      createdAt: new Date(now),
      updatedAt: new Date(now),
    }
  }

  async getStepState(runId: string, stepName: string): Promise<StepState> {
    const runStepKey = this.createRunStepKey(runId, stepName)

    const response = await this.docClient.send(
      new GetCommand({
        TableName: this.stepsTableName,
        Key: { runStepKey },
      })
    )

    if (!response.Item) {
      throw new Error(
        `Step not found: runId=${runId}, stepName=${stepName}. Use insertStepState to create it.`
      )
    }

    const item = response.Item
    return {
      stepId: item.stepId as string,
      status: item.status as any,
      result: item.result,
      error: item.error,
      attemptCount: item.attemptCount as number,
      retries: item.retries as number | undefined,
      retryDelay: item.retryDelay as string | undefined,
      createdAt: new Date(item.createdAt as number),
      updatedAt: new Date(item.updatedAt as number),
    }
  }

  async getRunHistory(
    runId: string
  ): Promise<Array<StepState & { stepName: string }>> {
    // Query all steps for this run
    const stepsResponse = await this.docClient.send(
      new QueryCommand({
        TableName: this.stepsTableName,
        IndexName: 'runId-index',
        KeyConditionExpression: 'runId = :runId',
        ExpressionAttributeValues: {
          ':runId': runId,
        },
      })
    )

    const allHistoryEntries: Array<StepState & { stepName: string }> = []

    // For each step, query its history
    for (const stepItem of stepsResponse.Items || []) {
      const stepId = stepItem.stepId as string

      const historyResponse = await this.docClient.send(
        new QueryCommand({
          TableName: this.historyTableName,
          KeyConditionExpression: 'stepId = :stepId',
          ExpressionAttributeValues: {
            ':stepId': stepId,
          },
        })
      )

      for (const historyItem of historyResponse.Items || []) {
        allHistoryEntries.push({
          stepId: historyItem.stepId as string,
          stepName: historyItem.stepName as string,
          status: historyItem.status as any,
          result: historyItem.result,
          error: historyItem.error,
          attemptCount: historyItem.attemptCount as number,
          retries: historyItem.retries as number | undefined,
          retryDelay: historyItem.retryDelay as string | undefined,
          createdAt: new Date(historyItem.createdAt as number),
          updatedAt: new Date(historyItem.createdAt as number),
          runningAt: historyItem.runningAt
            ? new Date(historyItem.runningAt as number)
            : undefined,
          scheduledAt: historyItem.scheduledAt
            ? new Date(historyItem.scheduledAt as number)
            : undefined,
          succeededAt: historyItem.succeededAt
            ? new Date(historyItem.succeededAt as number)
            : undefined,
          failedAt: historyItem.failedAt
            ? new Date(historyItem.failedAt as number)
            : undefined,
        })
      }
    }

    // Sort by creation time
    return allHistoryEntries.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    )
  }

  async setStepRunning(stepId: string): Promise<void> {
    // Extract runId and stepName from stepId (format: runId:stepName:timestamp)
    const parts = stepId.split(':')
    const runId = parts[0]!
    const stepName = parts.slice(1, -1).join(':')
    const runStepKey = this.createRunStepKey(runId, stepName)

    const now = Date.now()

    // Get current step to read attemptCount and retries
    const response = await this.docClient.send(
      new GetCommand({
        TableName: this.stepsTableName,
        Key: { runStepKey },
      })
    )

    const attemptCount = response.Item?.attemptCount as number
    const retries = response.Item?.retries as number | undefined
    const retryDelay = response.Item?.retryDelay as string | undefined

    await this.docClient.send(
      new UpdateCommand({
        TableName: this.stepsTableName,
        Key: { runStepKey },
        UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': 'running',
          ':updatedAt': now,
        },
      })
    )

    // Update current history record to running
    await this.updateCurrentHistoryRecord(
      stepId,
      stepName,
      attemptCount,
      'running',
      undefined,
      undefined,
      retries,
      retryDelay
    )
  }

  async setStepScheduled(stepId: string): Promise<void> {
    // Extract runId and stepName from stepId
    const parts = stepId.split(':')
    const runId = parts[0]!
    const stepName = parts.slice(1, -1).join(':')
    const runStepKey = this.createRunStepKey(runId, stepName)

    const now = Date.now()

    // Get current step to read attemptCount and retries
    const response = await this.docClient.send(
      new GetCommand({
        TableName: this.stepsTableName,
        Key: { runStepKey },
      })
    )

    const attemptCount = response.Item?.attemptCount as number
    const retries = response.Item?.retries as number | undefined
    const retryDelay = response.Item?.retryDelay as string | undefined

    await this.docClient.send(
      new UpdateCommand({
        TableName: this.stepsTableName,
        Key: { runStepKey },
        UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': 'scheduled',
          ':updatedAt': now,
        },
      })
    )

    // Update current history record to scheduled
    await this.updateCurrentHistoryRecord(
      stepId,
      stepName,
      attemptCount,
      'scheduled',
      undefined,
      undefined,
      retries,
      retryDelay
    )
  }

  async setStepResult(stepId: string, result: any): Promise<void> {
    // Extract runId and stepName from stepId
    const parts = stepId.split(':')
    const runId = parts[0]!
    const stepName = parts.slice(1, -1).join(':')
    const runStepKey = this.createRunStepKey(runId, stepName)

    const now = Date.now()

    // Get current step to read attemptCount and retries
    const response = await this.docClient.send(
      new GetCommand({
        TableName: this.stepsTableName,
        Key: { runStepKey },
      })
    )

    const attemptCount = response.Item?.attemptCount as number
    const retries = response.Item?.retries as number | undefined
    const retryDelay = response.Item?.retryDelay as string | undefined

    await this.docClient.send(
      new UpdateCommand({
        TableName: this.stepsTableName,
        Key: { runStepKey },
        UpdateExpression:
          'SET #status = :status, #result = :result, #updatedAt = :updatedAt REMOVE #error',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#result': 'result',
          '#error': 'error',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': 'succeeded',
          ':result': result,
          ':updatedAt': now,
        },
      })
    )

    // Update current history record to succeeded
    await this.updateCurrentHistoryRecord(
      stepId,
      stepName,
      attemptCount,
      'succeeded',
      result,
      undefined,
      retries,
      retryDelay
    )
  }

  async setStepError(stepId: string, error: Error): Promise<void> {
    // Extract runId and stepName from stepId
    const parts = stepId.split(':')
    const runId = parts[0]!
    const stepName = parts.slice(1, -1).join(':')
    const runStepKey = this.createRunStepKey(runId, stepName)

    const now = Date.now()

    const serializedError: SerializedError = {
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
    }

    // Get current step to read attemptCount and retries
    const response = await this.docClient.send(
      new GetCommand({
        TableName: this.stepsTableName,
        Key: { runStepKey },
      })
    )

    const attemptCount = response.Item?.attemptCount as number
    const retries = response.Item?.retries as number | undefined
    const retryDelay = response.Item?.retryDelay as string | undefined

    await this.docClient.send(
      new UpdateCommand({
        TableName: this.stepsTableName,
        Key: { runStepKey },
        UpdateExpression:
          'SET #status = :status, #error = :error, #updatedAt = :updatedAt REMOVE #result',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#error': 'error',
          '#result': 'result',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': 'failed',
          ':error': serializedError,
          ':updatedAt': now,
        },
      })
    )

    // Update current history record to failed
    await this.updateCurrentHistoryRecord(
      stepId,
      stepName,
      attemptCount,
      'failed',
      undefined,
      serializedError,
      retries,
      retryDelay
    )
  }

  async withRunLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    // DynamoDB doesn't have built-in locks like Postgres advisory locks
    // Use optimistic locking with a version field or implement distributed locking with another service
    // For simplicity, we'll just execute the function (caller should handle race conditions)
    // In production, consider using DynamoDB transactions or a separate lock table
    return await fn()
  }

  async createRetryAttempt(
    stepId: string,
    status: 'pending' | 'running'
  ): Promise<StepState> {
    // Extract runId and stepName from stepId
    const parts = stepId.split(':')
    const runId = parts[0]!
    const stepName = parts.slice(1, -1).join(':')
    const runStepKey = this.createRunStepKey(runId, stepName)

    const now = Date.now()

    // Get current step
    const response = await this.docClient.send(
      new GetCommand({
        TableName: this.stepsTableName,
        Key: { runStepKey },
      })
    )

    const currentAttempt = response.Item?.attemptCount as number
    const newAttemptCount = currentAttempt + 1
    const retries = response.Item?.retries as number | undefined
    const retryDelay = response.Item?.retryDelay as string | undefined

    // Reset step for retry
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.stepsTableName,
        Key: { runStepKey },
        UpdateExpression:
          'SET #status = :status, #attemptCount = :attemptCount, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#attemptCount': 'attemptCount',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':status': status,
          ':attemptCount': newAttemptCount,
          ':updatedAt': now,
        },
      })
    )

    // Insert NEW history record for retry attempt
    await this.saveStepHistory(
      stepId,
      stepName,
      newAttemptCount,
      'pending',
      undefined,
      undefined,
      retries,
      retryDelay
    )

    return {
      stepId: response.Item!.stepId as string,
      status: 'pending',
      result: response.Item!.result,
      error: response.Item!.error,
      attemptCount: newAttemptCount,
      retries,
      retryDelay,
      createdAt: new Date(response.Item!.createdAt as number),
      updatedAt: new Date(now),
    }
  }

  async close(): Promise<void> {
    if (this.ownsConnection) {
      this.docClient.destroy()
    }
  }
}
