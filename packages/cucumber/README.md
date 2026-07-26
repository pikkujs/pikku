# @pikku/cucumber

Cucumber test harness for Pikku function tests — personas, actors, stub
tracking and database helpers.

## Install

```bash
npm install -D @pikku/cucumber
```

## Usage

```typescript
import { Actor, createDbUtils, createStubProxy } from '@pikku/cucumber'

const db = createDbUtils(kysely)
const actor = new Actor('admin')
```

## Docs

https://pikku.dev/docs
