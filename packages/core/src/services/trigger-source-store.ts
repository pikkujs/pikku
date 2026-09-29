import type { WebhookSourceState } from '../wirings/trigger/webhook-source.types.js'

export type TriggerSourceKind = 'webhook'

export type DeclaredTriggerSource = { name: string; kind: TriggerSourceKind }

/**
 * One trigger source as an operator sees it. `state` is what the last `setup`
 * returned — provider identifiers only; any secret it issued lives in the
 * credential service.
 */
export type TriggerSourceRow = DeclaredTriggerSource & {
  enabled: boolean
  /** False once the declaration has gone from code, awaiting prune. */
  declared: boolean
  status: string | null
  state: WebhookSourceState | null
  /** The last step's instructions or error, for the operator. */
  detail: string | null
  updatedBy: string | null
  updatedAt: string | null
}

export type TriggerSourceResult = {
  status: string
  state?: WebhookSourceState | null
  detail?: string | null
}

/**
 * Which trigger sources an operator has enabled on this deployment, and what
 * enabling them registered with the provider.
 */
export interface TriggerSourceStore {
  /** Upserts the declared sources and marks the rest undeclared. Never touches `enabled`. */
  syncTriggerSources(sources: DeclaredTriggerSource[]): Promise<void>
  listTriggerSources(): Promise<TriggerSourceRow[]>
  getTriggerSource(name: string): Promise<TriggerSourceRow | null>
  setTriggerSourceEnabled(
    name: string,
    enabled: boolean,
    result: TriggerSourceResult,
    actor?: string
  ): Promise<void>
  /**
   * Deletes undeclared rows. An undeclared row still enabled is kept unless
   * `force`: its provider registration outlived its code and nothing is left
   * to tear it down.
   */
  pruneTriggerSources(options?: { force?: boolean }): Promise<string[]>
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
        enabled: false,
        declared: true,
        status: null,
        state: null,
        detail: null,
        updatedBy: null,
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

  async setTriggerSourceEnabled(
    name: string,
    enabled: boolean,
    result: TriggerSourceResult,
    actor?: string
  ) {
    const row = this.rows.get(name)
    if (!row) throw new Error(`Unknown trigger source: ${name}`)
    row.enabled = enabled
    row.status = result.status
    if (result.state !== undefined) row.state = result.state
    row.detail = result.detail ?? null
    row.updatedBy = actor ?? null
    row.updatedAt = new Date().toISOString()
  }

  async pruneTriggerSources({ force = false } = {}) {
    const pruned: string[] = []
    for (const row of this.rows.values()) {
      if (!row.declared && (force || !row.enabled)) {
        this.rows.delete(row.name)
        pruned.push(row.name)
      }
    }
    return pruned
  }
}
