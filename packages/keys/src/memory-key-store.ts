import type { KeyRecord, KeyStore, StoreContext } from '@pikku/core/keypair'

const copy = <T>(value: T): T => structuredClone(value)
const slot = (r: KeyRecord) => `${r.name}\u0000${r.scopeKey}`

/**
 * A {@link KeyStore} that keeps the ledger in memory and enforces the same
 * invariants the SQL store does: unique `(name, scopeKey, version)`, at most
 * one `active` and one `pending` per `(name, scopeKey)`, every transition a
 * compare-and-set. It is the base of the file store (which persists after each
 * change) and the store for tests and short-lived hosts: the root entry of
 * this package cannot import `node:fs`, so the in-memory form has to live
 * here. `ctx` is ignored: there is no transaction to join.
 */
export class MemoryKeyStore implements KeyStore {
  protected records = new Map<string, KeyRecord>()

  /** Called after every change with the new ledger; the file store writes it out. A throw rolls the change back. */
  protected async persist(): Promise<void> {}

  protected async mutate<T>(change: () => T): Promise<T> {
    const before = copy([...this.records])
    try {
      const result = change()
      await this.persist()
      return result
    } catch (error) {
      this.records = new Map(before)
      throw error
    }
  }

  private slotRecords(name: string, scopeKey: string) {
    return [...this.records.values()].filter(
      (r) => r.name === name && r.scopeKey === scopeKey
    )
  }

  private assertSlots() {
    const seen = new Set<string>()
    const versions = new Set<string>()
    for (const r of this.records.values()) {
      const version = `${slot(r)}\u0000${r.version}`
      if (versions.has(version)) {
        throw new Error('KeyStore: version already exists for this name')
      }
      versions.add(version)
      if (r.status === 'active' || r.status === 'pending') {
        const s = `${slot(r)}\u0000${r.status}`
        if (seen.has(s)) {
          throw new Error(`KeyStore: a ${r.status} key already exists`)
        }
        seen.add(s)
      }
    }
  }

  async list(name: string, scopeKey: string, _ctx?: StoreContext) {
    return this.slotRecords(name, scopeKey)
      .sort((a, b) => b.version - a.version)
      .map(copy)
  }

  async get(kid: string, _ctx?: StoreContext) {
    const found = this.records.get(kid)
    return found ? copy(found) : undefined
  }

  async listScopeKeys(name: string) {
    return [
      ...new Set(
        [...this.records.values()]
          .filter((r) => r.name === name)
          .map((r) => r.scopeKey)
      ),
    ].sort()
  }

  async insertPending(rec: KeyRecord, _ctx?: StoreContext) {
    if (rec.status !== 'minting' && rec.status !== 'pending') {
      throw new Error('KeyStore: insertPending takes a minting or pending row')
    }
    await this.mutate(() => {
      if (this.records.has(rec.kid)) throw new Error('KeyStore: kid exists')
      this.records.set(rec.kid, copy({ ...rec, rev: rec.rev ?? 0 }))
      this.assertSlots()
    })
  }

  async markPlaced(
    kid: string,
    publicKey: string,
    now: string,
    _ctx?: StoreContext
  ) {
    return this.mutate(() => {
      const rec = this.records.get(kid)
      if (rec?.status !== 'minting') return false
      rec.status = 'pending'
      rec.publicKey = publicKey
      rec.createdAt = rec.createdAt ?? now
      this.assertSlots()
      return true
    })
  }

  async markPublished(kid: string, at: string, _ctx?: StoreContext) {
    return this.mutate(() => {
      const rec = this.records.get(kid)
      if (!rec || rec.status !== 'pending' || rec.publishedAt) return false
      rec.publishedAt = at
      return true
    })
  }

  async promote(
    args: {
      pendingKid: string
      activeKid?: string
      verifyUntil?: string
      now: string
    },
    _ctx?: StoreContext
  ) {
    return this.mutate(() => {
      const pending = this.records.get(args.pendingKid)
      if (!pending || pending.status !== 'pending') return false
      const active = args.activeKid
        ? this.records.get(args.activeKid)
        : undefined
      if (args.activeKid) {
        if (!active || active.status !== 'active') return false
        if (slot(active) !== slot(pending)) return false
        // Demote before promote, as the SQL store must (unique slot indexes).
        active.status = 'previous'
        active.verifyUntil = args.verifyUntil
      } else if (
        this.slotRecords(pending.name, pending.scopeKey).some(
          (r) => r.status === 'active'
        )
      ) {
        return false
      }
      pending.status = 'active'
      pending.activatedAt = args.now
      this.assertSlots()
      return true
    })
  }

  async retire(kid: string, now: string, _ctx?: StoreContext) {
    return this.mutate(() => {
      const rec = this.records.get(kid)
      if (!rec || rec.status === 'retired') return false
      rec.status = 'retired'
      rec.retiredAt = now
      return true
    })
  }

  async firstActivate(rec: KeyRecord, _ctx?: StoreContext) {
    return this.mutate(() => {
      if (
        this.slotRecords(rec.name, rec.scopeKey).some(
          (r) => r.status === 'active'
        )
      ) {
        return false
      }
      this.records.set(
        rec.kid,
        copy({
          ...rec,
          status: 'active',
          activatedAt: rec.activatedAt ?? rec.createdAt,
        })
      )
      this.assertSlots()
      return true
    })
  }

  async updateCustody(
    kid: string,
    expect: { rev: number },
    set: {
      privateWrapped?: string | null
      metadata?: Record<string, unknown> | null
    },
    _ctx?: StoreContext
  ) {
    return this.mutate(() => {
      const rec = this.records.get(kid)
      if (!rec || rec.rev !== expect.rev) return false
      if ('privateWrapped' in set) rec.privateWrapped = set.privateWrapped
      if ('metadata' in set) rec.metadata = set.metadata
      rec.rev += 1
      return true
    })
  }

  async importRecords(
    recs: KeyRecord[],
    opts: { mode: 'insert' | 'reconcile' },
    _ctx?: StoreContext
  ) {
    return this.mutate(() => {
      let inserted = 0
      let updated = 0
      let skipped = 0
      const fresh = recs.filter((r) => !this.records.has(r.kid))
      for (const rec of recs) {
        if (!this.records.has(rec.kid)) continue
        if (opts.mode === 'insert') {
          skipped += 1
          continue
        }
        const existing = this.records.get(rec.kid)!
        this.records.set(rec.kid, copy({ ...rec, rev: existing.rev + 1 }))
        updated += 1
      }
      // New rows go in retired-first, so an adopted active row never meets the old one in its slot.
      for (const rec of fresh.sort(
        (a, b) =>
          Number(b.status === 'retired') - Number(a.status === 'retired')
      )) {
        this.records.set(rec.kid, copy({ ...rec, rev: rec.rev ?? 0 }))
        inserted += 1
      }
      this.assertSlots()
      return { inserted, updated, skipped }
    })
  }
}
