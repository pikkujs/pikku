import * as vscode from 'vscode'
import { join } from 'path'
import { inspect } from '@pikku/inspector'
import type { InspectorState } from '@pikku/inspector'
import { findConfigFile, loadConfig } from './utils/config'
import type { PikkuConfig } from './utils/config'

export class PikkuInspector implements vscode.Disposable {
  private state: InspectorState | undefined
  private config: PikkuConfig | undefined
  private watcher: vscode.FileSystemWatcher | undefined
  private debounceTimer: NodeJS.Timeout | undefined

  private readonly _onDidChange = new vscode.EventEmitter<void>()
  public readonly onDidChange = this._onDidChange.event

  private outputChannel: vscode.OutputChannel

  constructor(private workspaceRoot: string) {
    this.outputChannel = vscode.window.createOutputChannel('Pikku Inspector')
    this.setupFileWatcher()
  }

  private setupFileWatcher(): void {
    this.watcher = vscode.workspace.createFileSystemWatcher('**/*.ts')

    const debouncedRefresh = () => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer)
      }
      this.debounceTimer = setTimeout(() => {
        this.refresh()
      }, 1000)
    }

    this.watcher.onDidChange(debouncedRefresh)
    this.watcher.onDidCreate(debouncedRefresh)
    this.watcher.onDidDelete(debouncedRefresh)
  }

  async inspect(): Promise<InspectorState | undefined> {
    try {
      const configPath = await findConfigFile(this.workspaceRoot)
      if (!configPath) {
        this.outputChannel.appendLine('No pikku.config.json found in workspace')
        return undefined
      }

      this.config = await loadConfig(configPath)
      const { rootDir, srcDirectories, ignoreFiles } = this.config

      // Glob for TS files in source directories
      const filePatterns = srcDirectories.map(
        (dir) => new vscode.RelativePattern(join(rootDir, dir), '**/*.ts')
      )

      const allFiles: string[] = []
      for (const pattern of filePatterns) {
        const files = await vscode.workspace.findFiles(
          pattern,
          `{${(ignoreFiles || []).join(',')}}`
        )
        allFiles.push(...files.map((f) => f.fsPath))
      }

      if (allFiles.length === 0) {
        this.outputChannel.appendLine('No TypeScript files found to inspect')
        return undefined
      }

      const logger = {
        info: (msg: string) => this.outputChannel.appendLine(`[INFO] ${msg}`),
        error: (msg: string) => this.outputChannel.appendLine(`[ERROR] ${msg}`),
        warn: (msg: string) => this.outputChannel.appendLine(`[WARN] ${msg}`),
        debug: (msg: string) => this.outputChannel.appendLine(`[DEBUG] ${msg}`),
        critical: (_code: any, msg: string) =>
          this.outputChannel.appendLine(`[CRITICAL] ${msg}`),
        hasCriticalErrors: () => false,
      }

      this.state = await inspect(logger, allFiles, {
        rootDir,
        types: {
          configFileType: this.config.configFile,
          userSessionType: this.config.userSessionType,
          singletonServicesFactoryType:
            this.config.singletonServicesFactoryType,
          wireServicesFactoryType: this.config.wireServicesFactoryType,
        },
        tags: this.config.tags,
        schemaConfig: {
          tsconfig: this.config.tsconfig,
          schema: this.config.schema,
        },
      })

      this.outputChannel.appendLine(
        `Inspection complete. Found ${Object.keys(this.state.functions.meta).length} functions.`
      )

      return this.state
    } catch (err: any) {
      this.outputChannel.appendLine(`Inspection failed: ${err.message}`)
      vscode.window.showErrorMessage(`Pikku inspection failed: ${err.message}`)
      return undefined
    }
  }

  getState(): InspectorState | undefined {
    return this.state
  }

  getConfig(): PikkuConfig | undefined {
    return this.config
  }

  async refresh(): Promise<void> {
    await this.inspect()
    this._onDidChange.fire()
  }

  getFunctionTypes(funcId: string): string[] {
    if (!this.state) return []
    const types: string[] = []

    if (this.state.http?.meta) {
      const httpMeta = this.state.http.meta as Record<
        string,
        Record<string, any>
      >
      for (const routes of Object.values(httpMeta)) {
        for (const meta of Object.values(routes)) {
          if (meta.pikkuFuncId === funcId) types.push('http')
        }
      }
    }

    if (this.state.channels?.meta) {
      const channelsMeta = this.state.channels.meta as Record<string, any>
      for (const channel of Object.values(channelsMeta)) {
        const messages = [channel.connect, channel.disconnect, channel.message]
        for (const msg of messages) {
          if (msg && msg.pikkuFuncId === funcId) types.push('channel')
        }
      }
    }

    if (this.state.scheduledTasks?.meta) {
      if (funcId in this.state.scheduledTasks.meta) types.push('scheduler')
    }

    if (this.state.queueWorkers?.meta) {
      if (funcId in this.state.queueWorkers.meta) types.push('queue')
    }

    if (this.state.workflows?.meta) {
      if (funcId in this.state.workflows.meta) types.push('workflow')
    }

    if (this.state.mcpEndpoints?.toolsMeta) {
      if (funcId in this.state.mcpEndpoints.toolsMeta) types.push('mcp')
    }

    if (this.state.cli?.meta) {
      for (const program of Object.values(this.state.cli.meta) as any[]) {
        if (program.commands) {
          for (const cmd of program.commands) {
            if (cmd.pikkuFuncId === funcId) types.push('cli')
          }
        }
      }
    }

    if (this.state.triggers?.meta) {
      if (funcId in this.state.triggers.meta) types.push('trigger')
    }

    if (this.state.agents?.agentsMeta) {
      if (funcId in this.state.agents.agentsMeta) types.push('agent')
    }

    return [...new Set(types)]
  }

  getWiringSummary(funcId: string): string {
    if (!this.state) return ''
    const parts: string[] = []

    if (this.state.http?.meta) {
      const httpMeta = this.state.http.meta as Record<
        string,
        Record<string, any>
      >
      for (const [method, routes] of Object.entries(httpMeta)) {
        for (const [route, meta] of Object.entries(routes)) {
          if (meta.pikkuFuncId === funcId) {
            parts.push(`\u26A1 ${method.toUpperCase()} ${route}`)
          }
        }
      }
    }

    if (this.state.channels?.meta) {
      const channelsMeta = this.state.channels.meta as Record<string, any>
      for (const [name, channel] of Object.entries(channelsMeta)) {
        const messages = [channel.connect, channel.disconnect, channel.message]
        for (const msg of messages) {
          if (msg && msg.pikkuFuncId === funcId) {
            parts.push(`\uD83D\uDD0C WS: ${name}`)
          }
        }
      }
    }

    if (this.state.scheduledTasks?.meta) {
      const task = this.state.scheduledTasks.meta[funcId]
      if (task) {
        parts.push(`\u23F0 Cron: ${task.schedule}`)
      }
    }

    if (this.state.queueWorkers?.meta) {
      const worker = this.state.queueWorkers.meta[funcId]
      if (worker) {
        parts.push(`\uD83D\uDCE8 Queue: ${worker.name}`)
      }
    }

    if (this.state.mcpEndpoints?.toolsMeta) {
      const tool = this.state.mcpEndpoints.toolsMeta[funcId]
      if (tool) {
        parts.push(`\uD83D\uDEE0 MCP: ${tool.name}`)
      }
    }

    if (this.state.workflows?.meta) {
      const wf = this.state.workflows.meta[funcId]
      if (wf) {
        parts.push(`\uD83D\uDD04 Workflow: ${wf.name}`)
      }
    }

    if (this.state.triggers?.meta) {
      const trigger = this.state.triggers.meta[funcId]
      if (trigger) {
        parts.push(`\u2B50 Trigger: ${trigger.name}`)
      }
    }

    if (this.state.agents?.agentsMeta) {
      const agent = this.state.agents.agentsMeta[funcId]
      if (agent) {
        parts.push(`\uD83E\uDD16 Agent: ${agent.name}`)
      }
    }

    return parts.join(' | ')
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    this.watcher?.dispose()
    this._onDidChange.dispose()
    this.outputChannel.dispose()
  }
}
