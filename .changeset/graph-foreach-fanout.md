---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

feat(graph): per-item `forEach` fanout for declarative workflow graphs

A graph node can now run once per element of an upstream array:

```ts
postVideo: {
  forEach: 'getMyVideo',              // or (ref) => ref('getMyVideo', 'rows')
  mode: 'sequential',                 // optional, defaults to 'parallel'
  input: (ref, template, $item) => ({ url: $item('URL VIDEO') }),
}
```

Each element runs as its own step instance (`postVideo[0]`, `postVideo[1]`, …)
and the node's result is the ordered array of per-item results, so a fanned node
chains straight into another `forEach`. Downstream nodes wait for every item. A
non-array source fails the run loudly instead of coercing.

The change is additive: `forEach` and `mode` are new optional node fields, and
`$item` is appended after `template` so existing `input: (ref) => …` and
`input: (ref, template) => …` nodes are unchanged.
