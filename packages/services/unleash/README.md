# @pikku/unleash

Unleash-backed feature flags for Pikku.

Reads the client features endpoint over plain `fetch` rather than through
`unleash-client`, because the SDK polls on a timer belonging to a long-lived
process and a serverless isolate cannot hold one between requests. The snapshot
is cached by `CachedFlagSource`, which keeps the last good read when Unleash is
unreachable.

```ts
import { UnleashFeatureFlagSource } from '@pikku/unleash'

const featureFlags = new UnleashFeatureFlagSource({
  url: 'https://unleash.example.com',
  clientToken: await secrets.get('UNLEASH_CLIENT_TOKEN'),
  appName: 'fabric-backend',
})
```

## What maps, and what does not

- `enabled` becomes the flag's switch.
- The `default` strategy leaves the rollout unset — everyone in.
- `flexibleRollout` and the `gradualRollout*` family become the rollout
  percentage; the widest strategy wins.
- `userWithId` becomes per-subject overrides set to true.

Any other strategy is ignored rather than guessed at. Percentages are
approximate across providers: Pikku rehashes the subject with its own salt, so
the same subject can fall on the other side of a 50% line. The switch and the
overrides are exact.
