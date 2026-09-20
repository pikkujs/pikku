# @pikku/addon-typesafe

[TypeSafe System One](https://console.typesafe.ai) as a Pikku addon. It returns
typed judgments and calibrated probabilities, not generated text, which makes
it useful for the small decisions a program has to make about its own work.

## Install

```bash
yarn add @pikku/addon-typesafe
```

```typescript
import { wireAddon } from '#pikku/addon'

wireAddon({ name: 'typesafe', package: '@pikku/addon-typesafe' })
```

Provide `TYPESAFE_API_KEY` as a secret. The addon declares that name literally,
so it is scoped to exactly that one secret and needs no `secretGrants`. Do not
hand it `globalSecrets`: it makes outbound requests.

## Functions

### `typesafe:classifyTask`

```
{ task, context? }
  -> { plan:  { needed, noul },
       shape: { choice: 'function' | 'workflow' | 'agent', confidence, probabilities } }
```

Both judgments are made in one request against the same state. `plan.needed`
is the 0.5 cut on `plan.noul` — read the number if you want a different bar.

A low `shape.confidence` is the signal, not a failure. There is no `unknown`
option by design: a flat distribution over the three says "this description
does not yet say enough to choose", which is itself a reason to plan.

### `typesafe:ask`

```
{ state, questions } -> { answers }
```

The unopinionated door, for judgments this addon has no named function for.
Questions are `noul` (one 0–1 judgment, with optional `criteria` for what a 1
and a 0 look like) or `choice` (named options, each with a description or
`null`). Every question is evaluated against the same `state` in one request,
so related questions batched here are both cheaper and mutually consistent.

## Use

```typescript
import { ref } from '#pikku/function'

// as an agent tool
tools: [ref('typesafe:classifyTask')]

// as a workflow branch
const { shape } = await rpc.invoke('typesafe:classifyTask', { task })

// over HTTP
wireHTTP({
  method: 'post',
  route: '/classify',
  func: ref('typesafe:classifyTask'),
})
```

## Billing

TypeSafe is its own vendor with its own key, so its spend does not travel
through whatever LLM proxy the consuming app uses and will not appear in that
proxy's accounting. `SystemOneService.askWithUsage` (exported from
`@pikku/addon-typesafe/service`) returns the token counts for apps that meter
their own usage.
