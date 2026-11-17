import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after } from 'node:test'
import { defineServiceTests } from '../testing/service-tests.js'
import { MemoryKeyStore } from './memory-key-store.js'
import { FileKeyStore } from './file/file-key-store.js'

defineServiceTests({
  name: 'memory',
  services: {
    keyStore: async () => {
      const store = new MemoryKeyStore()
      return { open: async () => store }
    },
    // One instance is the whole ledger: a new MemoryKeyStore starts empty.
    keyStoreOptions: { persists: false },
  },
})

const dirs: string[] = []
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

defineServiceTests({
  name: 'file',
  services: {
    keyStore: async () => {
      const dir = mkdtempSync(join(tmpdir(), 'pikku-keystore-'))
      dirs.push(dir)
      return { open: async () => new FileKeyStore(join(dir, 'keys.json')) }
    },
  },
})
