import { CoreUserSession } from '../types/core.types.js'

/**
 * Minimal metadata for listing scheduled tasks
 */
export interface ScheduledTaskSummary {
  /** Unique task ID */
  taskId: string
  /** RPC function name to invoke */
  rpcName: string
  /** Scheduled execution time */
  scheduledFor: Date
}

/**
 * Full metadata for a scheduled task retrieved from the queue
 */
export interface ScheduledTaskInfo extends ScheduledTaskSummary {
  /** Data to pass to the RPC function */
  data?: any
  /** User session */
  session?: CoreUserSession
  /** Task status */
  status?: 'scheduled' | 'active' | 'completed' | 'failed'
}

/**
 * Abstract scheduler service for persistent scheduled task management
 * Implementations use queue backends (pg-boss, BullMQ) for distributed scheduling
 */
export abstract class SchedulerService {
  /**
   * Initialize the scheduler service
   */
  abstract init(): Promise<void>

  /**
   * Schedule a one-off delayed RPC call
   * @param delay - Delay before execution (number in milliseconds or duration string like "5h", "30m")
   * @param rpcName - RPC function name to invoke
   * @param data - Data to pass to the RPC function
   * @param session - Optional user session
   * @returns Task ID
   */
  abstract scheduleRPC(
    delay: number | string,
    rpcName: string,
    data?: any,
    session?: CoreUserSession
  ): Promise<string>

  /**
   * Unschedule a task by ID
   * @param taskId - Task ID
   * @returns Success status
   */
  abstract unschedule(taskId: string): Promise<boolean>

  /**
   * Get a scheduled task by ID with full details
   * @param taskId - Task ID
   * @returns Task info or null if not found
   */
  abstract getTask(taskId: string): Promise<ScheduledTaskInfo | null>

  /**
   * Get all scheduled tasks with minimal info
   * @returns Array of task summaries with taskId, rpcName, and schedule
   */
  abstract getAllTasks(): Promise<ScheduledTaskSummary[]>

  /**
   * Close any open connections
   */
  abstract close(): Promise<void>

  /**
   * Start recurring scheduled tasks (reads pikkuState for schedule definitions).
   * Default no-op for backward compatibility.
   */
  async start(): Promise<void> {}

  /**
   * Stop recurring scheduled tasks.
   * Default no-op for backward compatibility.
   */
  async stop(): Promise<void> {}
}
