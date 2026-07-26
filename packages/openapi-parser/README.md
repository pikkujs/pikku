# @pikku/openapi-parser

Parses OpenAPI specs into a normalised shape and generates Pikku addon code
from them — operations, parameters, error responses and security schemes.

## Install

```bash
npm install -D @pikku/openapi-parser
```

## Usage

```typescript
import { parseOpenAPISpec, computeContractHash } from '@pikku/openapi-parser'

const spec = await parseOpenAPISpec(specPath)
const hash = computeContractHash(spec)
```

The contract hash lets generated addons detect when an upstream spec changed.

## Docs

https://pikku.dev/docs
