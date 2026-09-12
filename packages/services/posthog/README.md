# @pikku/posthog

PostHog-backed feature flags for Pikku.

Reads PostHog's local-evaluation payload over plain `fetch` rather than through
`posthog-node`, because the SDK polls on a timer belonging to a long-lived
process and a serverless isolate cannot hold one between requests. The snapshot
is cached by `CachedFlagSource`, which keeps the last good read when PostHog is
unreachable.

```ts
import { PostHogFeatureFlagSource } from '@pikku/posthog'

const featureFlags = new PostHogFeatureFlagSource({
  personalApiKey: await secrets.get('POSTHOG_PERSONAL_API_KEY'),
  projectApiKey: await secrets.get('POSTHOG_PROJECT_API_KEY'),
  keyMap: { 'sandboxes-beta': 'sandboxes' },
})
```

## What maps, and what does not

PostHog's filter groups are richer than a flag's availability, so only the parts
that survive the trip are read:

- `active` becomes the flag's switch.
- A condition group with no property filters becomes the rollout percentage; the
  widest such group wins.
- A single exact-match condition on `$group_key`/`distinct_id` becomes a
  per-subject override.

Cohorts, other property operators, multivariate variants and `super_groups` are
ignored — not silently, they are documented non-mappings. A flag that depends on
them is evaluated by PostHog in the client, not by the function runner.

Percentages are approximate across providers: Pikku rehashes the subject with
its own salt, so the same subject can fall on the other side of a 50% line. The
switch and the overrides are exact.
