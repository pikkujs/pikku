import assert from 'node:assert'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'
import { SKILL_SNIPPETS, collectSnippets } from '@pikku/skills'

const here = dirname(fileURLToPath(import.meta.url))
// packages/cli/src/functions/commands -> the repo root
const repoRoot = join(here, '..', '..', '..', '..', '..')
const snippetSource = join(repoRoot, 'examples', 'online-shop')

/**
 * The code a skill shows is embedded at build time from an example project's
 * @snippet regions. This suite is the drift alarm: edit a region without
 * re-embedding, or break the embed expansion, and it fails. A region whose code
 * stops compiling fails the example's own build, which is the other half.
 */
describe('the snippets embedded in the skills', () => {
  test('are the regions the example project defines right now', async () => {
    const collected = await collectSnippets(snippetSource)
    const sorted = (entries: Iterable<[string, string]>) =>
      Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b)))

    assert.deepEqual(
      sorted(Object.entries(SKILL_SNIPPETS)),
      sorted(collected.entries()),
      'SKILL_SNIPPETS is stale or the example changed — run `bun run embed` in @pikku/skills'
    )
  })
})
