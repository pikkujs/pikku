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

## Measuring a milestone against its plan

A milestone note says what the app must DO; its plan — JSON beside the note — says
what has to EXIST for it, in passes. `planShortfall` reconciles that plan against
pikku's generated meta under `.pikku/`, so "was this function written, this route
wired, this scenario exported" is set membership rather than anyone's status:

```typescript
import {
  functionsDirFor,
  planShortfall,
  readPikkuMeta,
  readPlan,
} from '@pikku/knowledge'

const read = readPlan(root, 'knowledge/milestones/01-the-daily-entry.md')
if (read.ok) {
  const { missing, deferred, problems } = planShortfall(
    read.plan,
    readPikkuMeta(functionsDirFor(root))
  )
}
```

`missing` is the first pass and blocks; `deferred` is later work and is reported
only. `problems` are things that exist but do not do what was planned — a function
planned as restricted whose meta says `auth: false`, for one — and they block
whatever pass they came from, because the hole is in the app now.

## From the CLI

```bash
pikku knowledge validate
pikku knowledge index
pikku knowledge index --check

pikku knowledge plan schema                        # the plan format, in full
pikku knowledge plan set <milestone> <file>        # validate against the note, then write
pikku knowledge plan show <milestone> --for-build  # the ordered work a build follows
pikku knowledge plan progress <milestone>          # what it still owes; non-zero while short
pikku knowledge plan defer <milestone> <item> -r "<why>"
```
