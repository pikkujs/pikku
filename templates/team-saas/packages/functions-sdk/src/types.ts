// Record types for the FRONTEND, resolved from the generated RPC map — the same
// source `usePikkuQuery`/`usePikkuMutation` resolve their data types from.
//
// This file exists because there was previously no way to NAME a record type in
// the app. `api.gen.ts` imports FlattenedRPCMap but does not re-export it, and
// the map itself lives in the functions package's `.pikku/`, which the SDK's
// exports map does not reach. So a component that needed `Resource` had two bad
// options: import backend zod (`#pikku/db/zod.gen.js`) into the frontend, or
// hand-declare `interface Resource { … }` — a second source of truth that
// silently drifts from the function's schema.
//
//   import type { RPCOutput } from '@project/functions-sdk/types'
//   type Resource = RPCOutput<'listResources'>['resources'][number]
//
// The field types then flow from the backend function's `output:` schema, and a
// schema change breaks the component at compile time instead of at runtime.
import type { FlattenedRPCMap } from '../../functions/.pikku/rpc/pikku-rpc-wirings-map.gen.d.js'

export type { FlattenedRPCMap }

/** The input type of an RPC — the shape a form must produce. */
export type RPCInput<Name extends keyof FlattenedRPCMap> = FlattenedRPCMap[Name]['input']

/** The output type of an RPC — index into it for a row type. */
export type RPCOutput<Name extends keyof FlattenedRPCMap> = FlattenedRPCMap[Name]['output']

// The analytics registry, re-exported for the frontend. Same reach as the
// `.pikku` import above, and type-only, so nothing backend ends up in the
// browser bundle. This is what makes `analytics.event()` typed at the call site:
// the event name and its payload come from the one zod union the ingest
// validates against, so a typo is a build error rather than a forked series.
export type { AnalyticsEvent } from '../../functions/src/analytics/registry.js'
