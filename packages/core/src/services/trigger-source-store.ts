import type { WebhookSourceState } from '../wirings/trigger/webhook-source.types.js'

export type TriggerSourceKind = 'webhook'

export type DeclaredTriggerSource = { name: string; kind: TriggerSourceKind }

/**
 * What was registered with the provider for one declared trigger source.
 * `state` is what the last `setup` returned — provider identifiers only; any
 * secret it issued lives in the credential service.
 */
export type TriggerSourceRow = DeclaredTriggerSource & {
  /** False once the declaration has gone from code without a teardown: an orphan. */
  declared: boolean
  status: string | null
  state: WebhookSourceState | null
  /** The last step's instructions or error. */
  detail: string | null
  updatedAt: string | null
}

export type TriggerSourceResult = {
  status: string
  state?: WebhookSourceState | null
  detail?: string | null
}

/** What each declared trigger source registered with its provider. */
export interface TriggerSourceStore {
  /** Upserts the declared sources and marks the rest undeclared. */
  syncTriggerSources(sources: DeclaredTriggerSource[]): Promise<void>
  listTriggerSources(): Promise<TriggerSourceRow[]>
  getTriggerSource(name: string): Promise<TriggerSourceRow | null>
  recordTriggerSource(name: string, result: TriggerSourceResult): Promise<void>
  deleteTriggerSource(name: string): Promise<void>
}

export class InMemoryTriggerSourceStore implements TriggerSourceStore {
  private rows = new Map<string, TriggerSourceRow>()

  async syncTriggerSources(sources: DeclaredTriggerSource[]) {
    const names = new Set(sources.map((s) => s.name))
    for (const row of this.rows.values()) {
      row.declared = names.has(row.name)
    }
    for (const { name, kind } of sources) {
      const row = this.rows.get(name)
      if (row) {
        row.kind = kind
        continue
      }
      this.rows.set(name, {
        name,
        kind,
        declared: true,
        status: null,
        state: null,
        detail: null,
        updatedAt: null,
      })
    }
  }

  async listTriggerSources() {
    return [...this.rows.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((row) => ({ ...row }))
  }

  async getTriggerSource(name: string) {
    const row = this.rows.get(name)
    return row ? { ...row } : null
  }

  async recordTriggerSource(name: string, result: TriggerSourceResult) {
    const row = this.rows.get(name)
    if (!row) throw new Error(`Unknown trigger source: ${name}`)
    row.status = result.status
    if (result.state !== undefined) row.state = result.state
    row.detail = result.detail ?? null
    row.updatedAt = new Date().toISOString()
  }

  async deleteTriggerSource(name: string) {
    this.rows.delete(name)
  }
}
