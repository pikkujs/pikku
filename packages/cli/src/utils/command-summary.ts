import chalk from 'chalk'

export interface CommandSummaryStats {
  httpRoutes?: number
  channels?: number
  functions?: number
  scheduledTasks?: number
  triggers?: number
  queueWorkers?: number
  mcpEndpoints?: number
  cliCommands?: number
  workflows?: number
  nodes?: number
  workflowGraphs?: number
  [key: string]: number | undefined
}

/**
 * Utility class to collect and display command execution summaries
 */
export class CommandSummary {
  private stats: CommandSummaryStats = {}
  private startTime: number
  private commandName: string

  constructor(commandName: string) {
    this.commandName = commandName
    this.startTime = Date.now()
  }

  /**
   * Increment a stat counter
   */
  increment(key: keyof CommandSummaryStats, count: number = 1): void {
    this.stats[key] = (this.stats[key] || 0) + count
  }

  /**
   * Set a stat value directly
   */
  set(key: keyof CommandSummaryStats, value: number): void {
    this.stats[key] = value
  }

  /**
   * Get current stats
   */
  getStats(): CommandSummaryStats {
    return { ...this.stats }
  }

  /**
   * Get elapsed time in milliseconds
   */
  getElapsedTime(): number {
    return Date.now() - this.startTime
  }

  /**
   * Format the summary for display
   */
  format(): string {
    const elapsed = this.getElapsedTime()
    const lines: string[] = []

    // Header with timing
    lines.push(
      chalk.green(`\npikku ${this.commandName} (completed in ${elapsed}ms)`)
    )

    // Stats
    const statLabels: Record<keyof CommandSummaryStats, string> = {
      httpRoutes: 'HTTP route',
      channels: 'WebSocket channel',
      functions: 'Function',
      scheduledTasks: 'Scheduled task',
      triggers: 'Trigger',
      queueWorkers: 'Queue worker',
      mcpEndpoints: 'MCP endpoint',
      cliCommands: 'CLI command',
      workflows: 'Workflow',
      nodes: 'Node',
      workflowGraphs: 'Workflow graph',
    }

    for (const [key, label] of Object.entries(statLabels)) {
      const value = this.stats[key]
      if (value !== undefined && value > 0) {
        lines.push(chalk.gray(`  • ${value} ${label}${value > 1 ? 's' : ''}`))
      }
    }

    // If no stats, show a simple completion message
    if (Object.values(this.stats).every((v) => !v || v === 0)) {
      return chalk.green(
        `\npikku ${this.commandName} (completed in ${elapsed}ms)\n`
      )
    }

    return lines.join('\n') + '\n'
  }

  /**
   * Check if there are any stats to display
   */
  hasStats(): boolean {
    return Object.values(this.stats).some((v) => v && v > 0)
  }
}
