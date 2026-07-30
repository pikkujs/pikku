# @pikku/knowledge

Read, validate and index a project's `knowledge/` directory — the notes that say
**what an app is**, in the language its users use. **MIT licensed**, deliberately:
the format is the open core, so any tool can adopt it without taking on the Pikku
CLI's Business Source License.

The format is the [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog):
a note is a markdown file whose **path is its identity**, carrying YAML frontmatter
in which only `type` is required. This package implements one OKF _profile_ — the
app-project profile, whose sections are `slices/`, `entities/`, `decisions/`,
`questions/` and `wishlist/`.

## Reading a bundle

```typescript
import { readKnowledgeNotes, resourceIds } from '@pikku/knowledge'

for (const note of await readKnowledgeNotes(process.cwd())) {
  console.log(note.type, note.path, resourceIds(note))
}
```

## Validating one

```typescript
import { runKnowledgeValidate } from '@pikku/knowledge'

const { ok, findings } = await runKnowledgeValidate(root, outDir)
```

`findings` carries every note with no `type`, every section missing its `index.md`,
every slice with a status outside `proposed | dispatched | built` or more than three
entities or no third-person gherkin scenario — and every `resource:` that no longer
resolves.

`outDir` is the pikku codegen output directory, which is what makes the last check
possible: a note's `resource: func:createEntry` is verified against the generated
function meta, so a rename in the code surfaces as a dangling reference rather than
quietly turning the note into fiction.

The check **fails closed on drift and open on ignorance** — an id missing from a
kind that resolved is an error, while a kind with no generated meta at all is
skipped. A project with no queues is never told its queue references are broken.

## Indexing one

```typescript
import { runKnowledgeIndex } from '@pikku/knowledge'

await runKnowledgeIndex(root) // pass `true` to check without writing
```

Each `index.md` keeps whatever prose a human wrote; only the block between
`<!-- pikku:knowledge-index -->` markers is regenerated.

## From the CLI

```bash
pikku knowledge validate
pikku knowledge index
pikku knowledge index --check
```
