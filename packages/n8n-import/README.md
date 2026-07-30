# @pikku/n8n-import

Converts n8n workflow exports into Pikku workflow graphs, AI agents and stub
functions.

> "n8n" is used here only to name the file format this tool reads. This project
> is not affiliated with, endorsed by, or sponsored by n8n GmbH, and contains no
> n8n source code. Workflow corpora used for coverage measurement are fetched
> locally and never committed.

Static conversion only — it emits a manifest describing what mapped cleanly and
what needs hand-finishing.

## Install

```bash
npm install -D @pikku/n8n-import
```

## Usage

```typescript
import { parseN8n, generateWorkflowFromN8n } from '@pikku/n8n-import'

const parsed = parseN8n(JSON.parse(exportJson))
const generated = generateWorkflowFromN8n(parsed)
```

`UnsupportedTopologyError` is thrown for graph shapes with no Pikku equivalent.

## Docs

https://pikku.dev/docs
