import { CachedFlagSource } from '@pikku/core/flag'
import type {
  DeclaredFlag,
  FlagConfigSnapshot,
  FlagSubject,
} from '@pikku/core/flag'
import type { FeatureFlagStore, FlagRow } from '@pikku/core/services'
import { subjectIdOf } from '@pikku/core/flag'

/**
 * An in-memory FeatureFlagStore, so the verifier can exercise the runner gate
 * and the declaration lifecycle without a database.
 *
 * It keeps the parts of the contract a store cannot opt out of — a new flag
 * registers off, a sync never re-enables a killed one, and a removed
 * declaration is marked rather than deleted — because a double that simply
 * stored whatever it was handed would let a regression in any of the three
 * pass the verifier. `KyselyFeatureFlagStore` is what a real deployment wires.
 */
export class InMemoryFeatureFlagStore
  extends CachedFlagSource
  implements FeatureFlagStore
{
  private rows = new Map<string, FlagRow>()
  private overrides = new Map<string, Record<string, boolean>>()

  protected async fetchSnapshot(): Promise<FlagConfigSnapshot> {
    const snapshot: FlagConfigSnapshot = {}
    for (const [name, row] of this.rows) {
      snapshot[name] = {
        enabled: row.enabled,
        rolloutPercent: row.rolloutPercent,
        overrides: { ...(this.overrides.get(name) ?? {}) },
      }
    }
    return snapshot
  }

  async syncFlags(flags: DeclaredFlag[]) {
    const declared = new Set(flags.map((flag) => flag.name))
    for (const [name, row] of this.rows) {
      if (!declared.has(name)) {
        this.rows.set(name, { ...row, declared: false })
      }
    }
    for (const flag of flags) {
      const existing = this.rows.get(flag.name)
      this.rows.set(flag.name, {
        ...flag,
        // The operator's three fields survive a deploy; the declaration's two
        // are re-read from code, because editing them is how a flag's meaning
        // changes.
        enabled: existing?.enabled ?? false,
        rolloutPercent: existing?.rolloutPercent ?? null,
        declared: true,
      })
    }
    this.setDeclared(flags)
    this.invalidate()
  }

  async listFlags() {
    return [...this.rows.values()]
  }

  async setEnabled(key: string, enabled: boolean) {
    const row = this.rows.get(key)
    if (row) {
      this.rows.set(key, { ...row, enabled })
    }
    this.invalidate()
  }

  async setRollout(key: string, percent: number | null) {
    if (percent !== null && (percent < 0 || percent > 100)) {
      throw new Error(`Rollout must be between 0 and 100, got ${percent}`)
    }
    const row = this.rows.get(key)
    if (row) {
      this.rows.set(key, { ...row, rolloutPercent: percent })
    }
    this.invalidate()
  }

  async setOverride(key: string, subject: FlagSubject, enabled: boolean) {
    const id = this.requireSubject(subject)
    this.overrides.set(key, {
      ...(this.overrides.get(key) ?? {}),
      [id]: enabled,
    })
    this.invalidate()
  }

  async clearOverride(key: string, subject: FlagSubject) {
    const id = this.requireSubject(subject)
    const held = { ...(this.overrides.get(key) ?? {}) }
    delete held[id]
    this.overrides.set(key, held)
    this.invalidate()
  }

  async findStaleFlags() {
    return [...this.rows.values()]
      .filter((row) => !row.declared)
      .map((row) => row.name)
  }

  async pruneFlags() {
    const stale = await this.findStaleFlags()
    for (const name of stale) {
      this.rows.delete(name)
      this.overrides.delete(name)
    }
    this.invalidate()
    return stale
  }

  private requireSubject(subject: FlagSubject): string {
    const id = subjectIdOf(subject)
    if (id === undefined) {
      throw new Error('An override needs an organization or a user')
    }
    return id
  }
}
