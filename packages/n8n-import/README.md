# @pikku/n8n-import

Converts n8n workflow exports into Pikku workflow graphs, AI agents and stub
functions.

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
