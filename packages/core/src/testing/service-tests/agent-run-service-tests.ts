import { describe, test, before } from 'node:test'
import assert from 'node:assert/strict'

import type { AgentRunService } from '../../wirings/agent/agent.types.js'
import type { ServiceTestConfig } from '../service-tests.js'

/** Conformance suite for `agentRunService`. Runs only when a backend supplies one. */
export const defineAgentRunServiceTests = (
  name: string,
  agentRunService: NonNullable<
    ServiceTestConfig['services']['agentRunService']
  >,
  /**
   * Thread-ownership is a property of the two services together — the run
   * service lists what the storage service owns — so that half of the suite
   * only runs when a backend supplies both. Passed explicitly rather than
   * closed over, so the dependency is visible in the signature.
   */
  agentStorageService?: ServiceTestConfig['services']['agentStorageService']
): void => {
  const factory = agentRunService
  describe(`AgentRunService [${name}]`, () => {
    let agentService: AgentRunService

    before(async () => {
      agentService = await factory()
    })

    test('listThreads', async () => {
      const threads = await agentService.listThreads()
      assert.ok(Array.isArray(threads))
    })

    if (agentStorageService) {
      const storageFactory = agentStorageService

      // The `owners` constraint is what keeps the generated thread-management
      // functions from leaking across tenants: a caller may only list threads
      // owned by one of their session principals, matching the
      // `principal:sub-partition` composition resolveOwnerResourceId writes.
      test('listThreads scopes to the given owners, including sub-partitions', async () => {
        const storage = await storageFactory()
        await storage.createThread('owner-alice')
        await storage.createThread('owner-alice:project-1')
        await storage.createThread('owner-bob:secret')

        const threads = await agentService.listThreads({
          owners: ['owner-alice'],
        })
        const ids = threads.map((t) => t.resourceId)

        assert.ok(ids.includes('owner-alice'))
        assert.ok(ids.includes('owner-alice:project-1'))
        assert.ok(
          !ids.some((id) => id.startsWith('owner-bob')),
          "another owner's threads must not be listed"
        )
      })

      test('listThreads with an owner does not match a lookalike prefix', async () => {
        const storage = await storageFactory()
        await storage.createThread('owner-al')
        await storage.createThread('owner-alice-evil:p')

        const threads = await agentService.listThreads({
          owners: ['owner-al'],
        })
        const ids = threads.map((t) => t.resourceId)

        assert.ok(ids.includes('owner-al'))
        assert.ok(!ids.includes('owner-alice-evil:p'))
      })

      test('listThreads with an empty owners list returns nothing', async () => {
        const storage = await storageFactory()
        await storage.createThread('owner-empty-check')

        const threads = await agentService.listThreads({ owners: [] })
        assert.deepEqual(threads, [])
      })
    }

    test('getThread returns null for missing', async () => {
      const thread = await agentService.getThread('missing-thread')
      assert.equal(thread, null)
    })

    test('getDistinctAgentNames', async () => {
      const names = await agentService.getDistinctAgentNames()
      assert.ok(Array.isArray(names))
    })

    test('deleteThread returns false for missing', async () => {
      const result = await agentService.deleteThread('missing-thread')
      assert.equal(result, false)
    })
  })
}
