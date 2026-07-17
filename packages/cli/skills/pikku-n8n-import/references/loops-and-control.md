# Loops & control stubs

The importer maps the mechanical control flow (IF/Filter/Switch it can normalize →
`graph:branch`) but leaves the **semantic** cases as `control` stubs — chiefly
**Loop Over Items / splitInBatches** and Switch in expression mode. These need
judgment, which is why they are not compiled. Read the loop body and the workflow
around it; decide, or ask.

## Loop Over Items / splitInBatches

n8n's loop node has two outputs: **loop** (output 1, fires per batch) and **done**
(output 0, fires once when iteration finishes). The loop body flows from the loop
output back into the node — a cycle. Pikku graphs are a DAG, so **the loop becomes a
`graph:map`** (`@pikku/addon-graph`) and the back-edge disappears:

```ts
theLoop: "graph:map",   // (graph:fanout) — one child invocation per item
// config:
theLoop: {
  input: (ref) => ({
    items: ref("<predecessor>"),        // what fed the loop
    child: "<childRpc-or-subGraph>",    // the loop body
    childInput: { /* $item-rebound body input */ },
    stepPrefix: "theLoop",
  }),
  next: "<done-branch target>",          // output 0
}
```

Inside `childInput`, references rebind to the current element: the body's `$json` /
predecessor and any `$('<loop node>')` become `$item`.

### Decide the shape first

| Loop body does… | Emit |
|---|---|
| transform each item independently (enrich, format, call one thing) | `graph:map` — child = the body |
| accumulate across items (running total, build one object/array) | a **reduce**: a single generated function over the whole array, not a map — `graph:map` collects per-item results and *loses* the accumulator |
| pure side-effect per item, nothing downstream consumes results | `graph:map` with **no `next`** (done branch empty) — the safest, unambiguous case |

### Child arity

- **Single-node body** → `child: "<that node's rpc>"`, its input as `childInput`.
- **Multi-node body** → the child must be a per-item **sub-graph**. Lift the body
  into its own `pikkuWorkflowGraph` (see `pikku-workflow`) and set `child` to that
  workflow's registered name. If the body references nodes **outside** the loop
  (not just the item), that value has to be threaded in as `childInput` — if you
  can't do it cleanly, stop and ask rather than emit something subtly wrong.

### Done-branch semantics (ask if it matters)

n8n's done output is version-dependent: it may carry the *original* items or the
*accumulated* results. `graph:map`'s `next` receives the array of child results.
If a downstream node reads that array's shape and the distinction matters, add:

```ts
// TODO(n8n): done branch receives collected loop results (not original items) — confirm this matches intent
```

and call it out in your summary. When the done branch is empty, there's nothing to
decide.

### batchSize > 1

`graph:map` is one-item-at-a-time. A real numeric `batchSize` (chunk into groups,
run the body per chunk) has no direct primitive — leave the stub, and tell the user
this loop batches N-at-a-time and needs a manual pass (or a `graph:chunk` +
`graph:map` composition if the body is chunk-shaped).

## Switch / control stubs the importer couldn't normalize

A Switch in **expression mode** (routing by an arbitrary JS expression rather than
comparable conditions) stays a `control` stub. Options, in order of preference:

1. If the expression is really a set of value comparisons, rewrite the node as a
   `graph:branch` by hand (see `pikku-workflow` for the `branch` shape) and wire the
   emitted `next` keys to the branch targets.
2. If it's genuinely computed routing, translate the stub into a small function that
   returns the branch key, then feed it a `graph:branch`.
3. If neither is faithful, leave the stub and explain what the Switch does.

## Never

- Emit a `graph:map` for an accumulator loop — you'll silently drop the running state.
- Guess the done-branch semantics when a downstream node depends on the shape — mark
  it and surface it.
- Invent a batching primitive — say what's unsupported instead.
