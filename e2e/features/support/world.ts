import { World, setWorldConstructor } from '@cucumber/cucumber'
import type { IWorldOptions } from '@cucumber/cucumber'
import type { ChildProcess } from 'node:child_process'

export type ProcessRole = 'api' | 'worker'

export type ManagedProcess = {
  name: string
  role: ProcessRole
  profile?: string
  port?: number
  child: ChildProcess
  logs: string[]
}

export class E2EWorld extends World {
  namespace: string
  processes = new Map<string, ManagedProcess>()
  runAliases = new Map<string, string>()
  latestRunResponses = new Map<string, any>()
  latestRPCResponses = new Map<string, any>()
  latestHTTPResponse?: { status: number; body: any }
  latestErrorResponse?: { status: number; body: any }

  constructor(options: IWorldOptions) {
    super(options)
    this.namespace = `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }
}

setWorldConstructor(E2EWorld)
