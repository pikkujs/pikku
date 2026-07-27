# @pikku/cucumber

Cucumber test harness for Pikku function tests — personas, actors, stub
tracking and database helpers.

> **Deprecated.** Pikku's own end-to-end suite has moved off cucumber onto
> [`pikkuScenario` / `pikkuScenarioStep`](https://pikku.dev), where a step is an
> ordinary typed Pikku function, step results thread through the scenario as
> locals instead of mutable World state, and `pikku scenario run` drives the
> suite against any configured environment rather than only localhost. This
> package remains published so existing suites keep building, but it receives no
> new features. New projects should not adopt it.

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
